package service

import (
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

// TestPaymentNoticeDatabaseMatrix pays one user with an order and then a
// redemption code and checks that each payment is announced once, with the
// payment's number and the running total.
func TestPaymentNoticeDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			databaseType := common.DatabaseTypeSQLite
			var dialector gorm.Dialector
			switch dialect {
			case "sqlite":
				dialector = sqlite.Open(":memory:")
			case "mysql":
				dsn := os.Getenv("TEST_MYSQL_DSN")
				if dsn == "" {
					t.Skip("TEST_MYSQL_DSN is not configured")
				}
				databaseType = common.DatabaseTypeMySQL
				dialector = mysql.Open(dsn)
			case "postgres":
				dsn := os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN is not configured")
				}
				databaseType = common.DatabaseTypePostgreSQL
				dialector = postgres.Open(dsn)
			}
			db, err := gorm.Open(dialector, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "pay_notice_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)

			type payment struct{ userId, quota int }
			var payments []payment
			general := operation_setting.GetGeneralSetting()
			previousDB, previousLogDB, previousHook := model.DB, model.LOG_DB, model.PaymentReceivedHook
			previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
			previousDisplay, previousRate, previousName := general.QuotaDisplayType, operation_setting.USDExchangeRate, common.SystemName
			model.DB, model.LOG_DB = db, db
			common.SetDatabaseTypes(databaseType, databaseType)
			model.PaymentReceivedHook = func(userId int, quota int) { payments = append(payments, payment{userId, quota}) }
			general.QuotaDisplayType = operation_setting.QuotaDisplayTypeCNY
			operation_setting.USDExchangeRate = 6.8
			common.SystemName = "Site"
			tables := []any{&model.User{}, &model.TopUp{}, &model.Redemption{}, &model.Log{}}
			t.Cleanup(func() {
				model.DB, model.LOG_DB, model.PaymentReceivedHook = previousDB, previousLogDB, previousHook
				common.SetDatabaseTypes(previousMain, previousLog)
				general.QuotaDisplayType, operation_setting.USDExchangeRate, common.SystemName = previousDisplay, previousRate, previousName
				require.NoError(t, db.Migrator().DropTable(tables...))
				require.NoError(t, sqlDB.Close())
			})
			require.NoError(t, db.AutoMigrate(tables...))
			var version string
			versionQuery := "SELECT version()"
			if dialect == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Logf("database version: %s", version)

			const userId = 7
			now := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)
			require.NoError(t, db.Omit("AdminPermissions").Create(&model.User{Id: userId, Username: "payer", AffCode: "payer", Status: common.UserStatusEnabled, CreatedAt: now.Add(-50 * time.Hour).Unix()}).Error)
			require.NoError(t, db.Create([]*model.TopUp{
				{UserId: userId, Amount: 68, Money: 10, TradeNo: "paid", PaymentProvider: model.PaymentProviderStripe, PaymentMethod: model.PaymentMethodStripe, Status: common.TopUpStatusPending},
				{UserId: userId, Amount: 68, Money: 10, TradeNo: "unpaid", PaymentProvider: model.PaymentProviderStripe, Status: common.TopUpStatusPending},
				{UserId: userId, Amount: 68, Money: 10, TradeNo: "refunded", PaymentProvider: model.PaymentProviderStripe, Status: common.TopUpStatusRefunded, CreditedQuota: 5000000},
				{UserId: userId + 1, Amount: 68, Money: 10, TradeNo: "other", PaymentProvider: model.PaymentProviderStripe, Status: common.TopUpStatusSuccess, CreditedQuota: 5000000},
			}).Error)
			code := &model.Redemption{Key: "0123456789abcdef0123456789abcdef", Name: "code", Quota: int(2.5 * common.QuotaPerUnit), Status: common.RedemptionCodeStatusEnabled}
			require.NoError(t, db.Create(code).Error)

			require.NoError(t, model.Recharge("paid", "cus", "127.0.0.1"))
			require.Error(t, model.Recharge("paid", "cus", "127.0.0.1"))
			require.NoError(t, model.ManualCompleteTopUp("paid", "127.0.0.1"))
			require.Equal(t, []payment{{userId, int(10 * common.QuotaPerUnit)}}, payments)
			text, err := paymentNoticeText(userId, payments[0].quota, now)
			require.NoError(t, err)
			assert.Equal(t, "【Site】收款通知\n用户名：payer\n充值金额：¥68.00\n充值次数：第 1 次\n累计充值：¥68.00\n已注册：2 天", text)

			_, err = model.Redeem(code.Key, userId)
			require.NoError(t, err)
			_, err = model.Redeem(code.Key, userId)
			require.Error(t, err)
			require.NoError(t, db.Delete(&model.Redemption{}, code.Id).Error)
			require.Len(t, payments, 2)
			require.NoError(t, db.Model(&model.User{}).Where("id = ?", userId).Update("created_at", 0).Error)
			text, err = paymentNoticeText(userId, payments[1].quota, now)
			require.NoError(t, err)
			assert.Equal(t, "【Site】收款通知\n用户名：payer\n充值金额：¥17.00\n充值次数：第 2 次\n累计充值：¥85.00\n已注册：未知", text)
		})
	}
}
