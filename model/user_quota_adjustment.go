package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

var (
	ErrInvalidUserQuotaAdjustment = errors.New("invalid user quota adjustment")
	ErrUserQuotaPermission        = errors.New("cannot adjust quota for this user role")
)

// UserQuotaAdjustment is the immutable database snapshot of a committed manual
// adjustment. Pending relay deductions in the quota cache are not part of it.
type UserQuotaAdjustment struct {
	UserID   int
	Username string
	Before   int
	After    int
}

// TestCreditCNY is the fixed yuan amount of one test credit grant.
const TestCreditCNY = 10

// TestCredit records one promotional grant. It carries cost but no revenue, so
// the business dashboard reports it apart from top-ups.
type TestCredit struct {
	Id         int `json:"id"`
	UserId     int `json:"user_id" gorm:"index"`
	Quota      int `json:"quota"`
	OperatorId int `json:"operator_id"`
	// UsedQuotaAtGrant is the user's lifetime usage when the credit was granted,
	// so usage from before the grant is not mistaken for spending it.
	UsedQuotaAtGrant int   `json:"used_quota_at_grant"`
	CreatedAt        int64 `json:"created_at" gorm:"bigint;autoCreateTime;index"`
}

// testCreditQuota converts the fixed yuan amount at the administrator's rate,
// the same rate wallet top-ups in yuan are credited at.
func testCreditQuota() (int, error) {
	rate := operation_setting.USDExchangeRate
	if rate <= 0 {
		return 0, ErrInvalidUserQuotaAdjustment
	}
	return common.WalletQuotaFromDecimalStrict(
		decimal.NewFromInt(TestCreditCNY).
			Div(decimal.NewFromFloat(rate)).
			Mul(decimal.NewFromFloat(common.QuotaPerUnit)),
	)
}

// GrantTestCredit adds the fixed test credit and its record in one transaction,
// so the dashboard never misses a grant that reached a wallet.
func GrantTestCredit(userID, operatorRole, operatorID int) (*UserQuotaAdjustment, error) {
	quota, err := testCreditQuota()
	if err != nil {
		return nil, err
	}
	return adjustUserQuota(userID, operatorRole, "add", quota, func(tx *gorm.DB, user *User) error {
		return tx.Create(&TestCredit{UserId: userID, Quota: quota, OperatorId: operatorID, UsedQuotaAtGrant: user.UsedQuota}).Error
	})
}

func AdjustUserQuota(userID, operatorRole int, mode string, value int) (*UserQuotaAdjustment, error) {
	return adjustUserQuota(userID, operatorRole, mode, value, nil)
}

func adjustUserQuota(userID, operatorRole int, mode string, value int, onAdjusted func(tx *gorm.DB, user *User) error) (*UserQuotaAdjustment, error) {
	if userID <= 0 || (mode != "add" && mode != "subtract" && mode != "override") {
		return nil, ErrInvalidUserQuotaAdjustment
	}
	if mode != "override" && value <= 0 {
		return nil, ErrInvalidUserQuotaAdjustment
	}
	if value > common.MaxWalletQuota || value < -common.MaxWalletQuota {
		return nil, ErrWalletQuotaLimitExceeded
	}

	var adjustment UserQuotaAdjustment
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).First(&user, userID).Error; err != nil {
			return err
		}
		if operatorRole != common.RoleRootUser && operatorRole <= user.Role {
			return ErrUserQuotaPermission
		}
		if user.Quota > common.MaxWalletQuota || user.Quota < -common.MaxWalletQuota {
			return ErrWalletQuotaLimitExceeded
		}
		quota := decimal.NewFromInt(int64(value))
		switch mode {
		case "add":
			quota = decimal.NewFromInt(int64(user.Quota)).Add(quota)
		case "subtract":
			quota = decimal.NewFromInt(int64(user.Quota)).Sub(quota)
		}
		after, err := common.WalletQuotaFromDecimalStrict(quota)
		if err != nil {
			return ErrWalletQuotaLimitExceeded
		}
		// An unchanged override is a successful operation, including on MySQL
		// configurations that count only changed rows in RowsAffected.
		if after != user.Quota {
			result := tx.Model(&User{}).Where("id = ?", userID).Update("quota", after)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return gorm.ErrRecordNotFound
			}
		}
		adjustment = UserQuotaAdjustment{UserID: user.Id, Username: user.Username, Before: user.Quota, After: after}
		if onAdjusted != nil {
			return onAdjusted(tx, &user)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Apply only the committed difference, preserving outstanding reservations.
	// Both balances are bounded above, so their difference fits in int64.
	delta := int64(adjustment.After) - int64(adjustment.Before)
	if delta != 0 {
		if err := cacheIncrUserQuota(userID, delta); err != nil {
			common.SysError(common.LogText("failed to sync manual quota adjustment for user %d: %s", userID, err))
		}
	}
	return &adjustment, nil
}
