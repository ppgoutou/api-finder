package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func insertUsersForPaginationTest(t *testing.T, total int) {
	t.Helper()
	for id := 1; id <= total; id++ {
		user := &User{
			Id:          id,
			Username:    fmt.Sprintf("user%02d", id),
			Password:    "password123",
			DisplayName: fmt.Sprintf("User %02d", id),
			Email:       fmt.Sprintf("user%02d@example.com", id),
			Role:        common.RoleCommonUser,
			Status:      common.UserStatusEnabled,
			Group:       "default",
			AffCode:     fmt.Sprintf("aff%02d", id),
		}
		require.NoError(t, DB.Create(user).Error)
	}
}

func collectUserIDs(users []*User) []int {
	ids := make([]int, 0, len(users))
	for _, user := range users {
		ids = append(ids, user.Id)
	}
	return ids
}

func TestGetAllUsersSortsBeforePagination(t *testing.T) {
	truncateTables(t)
	insertUsersForPaginationTest(t, 42)

	pageOne, total, err := GetAllUsers(&common.PageInfo{Page: 1, PageSize: 20}, NewUserSortOptions("id", "asc"))
	require.NoError(t, err)
	assert.Equal(t, int64(42), total)
	assert.Equal(t, []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20}, collectUserIDs(pageOne))

	pageTwo, total, err := GetAllUsers(&common.PageInfo{Page: 2, PageSize: 20}, NewUserSortOptions("id", "asc"))
	require.NoError(t, err)
	assert.Equal(t, int64(42), total)
	assert.Equal(t, []int{21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40}, collectUserIDs(pageTwo))

	pageThree, total, err := GetAllUsers(&common.PageInfo{Page: 3, PageSize: 20}, NewUserSortOptions("id", "asc"))
	require.NoError(t, err)
	assert.Equal(t, int64(42), total)
	assert.Equal(t, []int{41, 42}, collectUserIDs(pageThree))
}

func TestSearchUsersSortsBeforePagination(t *testing.T) {
	truncateTables(t)
	insertUsersForPaginationTest(t, 42)

	users, total, err := SearchUsers("user", "", nil, nil, 20, 20, NewUserSortOptions("id", "asc"))
	require.NoError(t, err)
	assert.Equal(t, int64(42), total)
	assert.Equal(t, []int{21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40}, collectUserIDs(users))
}

func TestGetAllUsersDefaultsToNewestRegistrationFirst(t *testing.T) {
	truncateTables(t)
	insertUsersForPaginationTest(t, 3)
	// Ids are random in production, so registration time must decide the order.
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 1).Update("created_at", 300).Error)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 2).Update("created_at", 100).Error)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 3).Update("created_at", 200).Error)

	users, total, err := GetAllUsers(&common.PageInfo{Page: 1, PageSize: 20}, NewUserSortOptions("", ""))
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	assert.Equal(t, []int{1, 3, 2}, collectUserIDs(users))
}

func TestGetAllUsersSortsByInviteCount(t *testing.T) {
	truncateTables(t)
	insertUsersForPaginationTest(t, 6)
	// aff_count only grows when an inviter reward is paid, so it must not drive the count.
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 1).Update("aff_count", 9).Error)
	require.NoError(t, DB.Model(&User{}).Where("id IN ?", []int{3, 4}).Update("inviter_id", 2).Error)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 5).Update("inviter_id", 1).Error)
	require.NoError(t, DB.Delete(&User{}, 4).Error) // deleted invitees still count

	users, _, err := GetAllUsers(&common.PageInfo{Page: 1, PageSize: 3}, NewUserSortOptions("invite_count", "desc"))
	require.NoError(t, err)
	assert.Equal(t, []int{2, 1, 6}, collectUserIDs(users))
	assert.Equal(t, []int64{2, 1, 0}, []int64{users[0].InviteCount, users[1].InviteCount, users[2].InviteCount})

	searched, _, err := SearchUsers("user", "", nil, nil, 0, 20, NewUserSortOptions("invite_count", "asc"))
	require.NoError(t, err)
	assert.Equal(t, 2, searched[len(searched)-1].Id)
	assert.Equal(t, int64(2), searched[len(searched)-1].InviteCount)
}
