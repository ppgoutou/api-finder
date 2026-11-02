package service

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// StartAffQuotaAutoTransferTask moves every user's pending invitation quota
// into their wallet once a day at the configured AffAutoTransferTime (server
// time). A run missed while the process was down happens on the next check
// that day. Only the master instance runs it.
func StartAffQuotaAutoTransferTask() {
	if !common.IsMasterNode {
		return
	}
	go func() {
		lastRunDay := ""
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for now := range ticker.C {
			transferAt, err := time.ParseInLocation("15:04", common.AffAutoTransferTime, now.Location())
			if err != nil {
				continue
			}
			today := now.Format(time.DateOnly)
			due := time.Date(now.Year(), now.Month(), now.Day(), transferAt.Hour(), transferAt.Minute(), 0, 0, now.Location())
			if lastRunDay == today || now.Before(due) {
				continue
			}
			lastRunDay = today
			moveAllPendingAffQuota()
		}
	}()
}

func moveAllPendingAffQuota() {
	userIds, err := model.GetUserIdsWithPendingAffQuota()
	if err != nil {
		common.SysError(common.LogText("failed to list users with pending invitation quota: %s", err.Error()))
		return
	}
	movedUsers := 0
	for _, userId := range userIds {
		moved, err := model.MovePendingAffQuotaToWallet(userId)
		if err != nil {
			common.SysError(common.LogText("failed to move pending invitation quota for user %d: %s", userId, err.Error()))
			continue
		}
		if moved > 0 {
			movedUsers++
		}
	}
	common.SysLog(common.LogText("moved pending invitation quota to wallets for %d users", movedUsers))
}
