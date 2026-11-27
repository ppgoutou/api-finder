package controller

import (
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const holidayThemeOptionKey = "HolidayTheme"

var errInvalidHolidayTheme = errors.New("invalid holiday theme settings")

// holidayThemeSettings is the HolidayTheme option: a seasonal look the site
// wears from the first day to the last day, both inclusive. An empty theme
// turns it off.
type holidayThemeSettings struct {
	Theme string `json:"theme"`
	Start string `json:"start"`
	End   string `json:"end"`
}

// validateHolidayTheme checks the HolidayTheme option before it is saved: a
// known theme with real first and last days in order.
func validateHolidayTheme(value string) error {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	var settings holidayThemeSettings
	if err := common.UnmarshalJsonStr(value, &settings); err != nil {
		return errInvalidHolidayTheme
	}
	if settings.Theme == "" {
		return nil
	}
	if settings.Theme != "christmas" {
		return errInvalidHolidayTheme
	}
	start, err := time.Parse(time.DateOnly, settings.Start)
	if err != nil {
		return errInvalidHolidayTheme
	}
	end, err := time.Parse(time.DateOnly, settings.End)
	if err != nil || end.Before(start) {
		return errInvalidHolidayTheme
	}
	return nil
}
