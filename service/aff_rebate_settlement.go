package service

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const affRebateSettlementInterval = 10 * time.Minute

// StartAffRebateSettlementTask moves invitation rebates whose holding period
// has ended into the inviters' wallets. Only the master instance runs it.
func StartAffRebateSettlementTask() {
	if !common.IsMasterNode {
		return
	}
	go func() {
		ticker := time.NewTicker(affRebateSettlementInterval)
		defer ticker.Stop()
		for {
			settled, err := model.SettleDueAffRebates(time.Now().Unix())
			if err != nil {
				common.SysError(common.LogText("failed to settle invitation rebates: %s", err.Error()))
			} else if settled > 0 {
				common.SysLog(common.LogText("settled %d invitation rebates", settled))
			}
			<-ticker.C
		}
	}()
}
