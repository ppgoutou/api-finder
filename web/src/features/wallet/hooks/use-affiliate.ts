/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import i18next from 'i18next'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getSelf } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import {
  getServerMessage,
  requireServerSuccess,
} from '@/lib/server-error-message'

import {
  getAffiliateCode,
  getAffiliateInvitees,
  getAffiliateRebates,
  getAffiliateSummary,
  transferAffiliateQuota,
} from '../api'
import { generateAffiliateLink } from '../lib'

// ============================================================================
// Affiliate Hook
// ============================================================================

export function useAffiliate() {
  const [affiliateCode, setAffiliateCode] = useState<string>('')
  const [affiliateLink, setAffiliateLink] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [transferring, setTransferring] = useState(false)
  const { copyToClipboard } = useCopyToClipboard()

  // Fetch affiliate code
  const fetchAffiliateCode = useCallback(async () => {
    try {
      setLoading(true)
      const response = requireServerSuccess(await getAffiliateCode())

      if (response.success && response.data) {
        setAffiliateCode(response.data)
        const link = generateAffiliateLink(response.data)
        setAffiliateLink(link)
      }
    } catch (error) {
      handleServerError(error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Copy affiliate link
  const copyAffiliateLink = useCallback(() => {
    copyToClipboard(affiliateLink)
  }, [affiliateLink, copyToClipboard])

  // Transfer affiliate quota to balance
  const transferQuota = useCallback(async (quota: number): Promise<boolean> => {
    try {
      setTransferring(true)
      const response = await transferAffiliateQuota({ quota })

      if (response.success) {
        toast.success(
          getServerMessage(response) || i18next.t('Transfer successful')
        )
        await getSelf()
        return true
      }

      handleServerError(response, i18next.t('Transfer failed'))
      return false
    } catch (_error) {
      handleServerError(_error, i18next.t('Transfer failed'))
      return false
    } finally {
      setTransferring(false)
    }
  }, [])

  useEffect(() => {
    fetchAffiliateCode()
  }, [fetchAffiliateCode])

  return {
    affiliateCode,
    affiliateLink,
    loading,
    transferring,
    copyAffiliateLink,
    transferQuota,
    refetch: fetchAffiliateCode,
  }
}

export const AFFILIATE_PAGE_SIZE = 10

/** One page of the users who signed up with the caller's invitation code. */
export function useAffiliateInvitees(page: number) {
  return useQuery({
    queryKey: ['wallet', 'affiliate-invitees', page],
    queryFn: async () =>
      requireServerSuccess(
        await getAffiliateInvitees(page, AFFILIATE_PAGE_SIZE)
      ).data,
    placeholderData: (previous) => previous,
  })
}

/** One page of the invitation rebates paid to the caller. */
export function useAffiliateRebates(page: number) {
  return useQuery({
    queryKey: ['wallet', 'affiliate-rebates', page],
    queryFn: async () =>
      requireServerSuccess(await getAffiliateRebates(page, AFFILIATE_PAGE_SIZE))
        .data,
    placeholderData: (previous) => previous,
  })
}

/** The caller's referral totals and the current rebate rules. */
export function useAffiliateSummary() {
  return useQuery({
    queryKey: ['wallet', 'affiliate-summary'],
    queryFn: async () => requireServerSuccess(await getAffiliateSummary()).data,
  })
}
