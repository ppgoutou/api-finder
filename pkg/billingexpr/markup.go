package billingexpr

import (
	"fmt"
	"slices"

	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
	"github.com/shopspring/decimal"
)

// tokenPriceScale is the divisor of a canonical token term,
// u("tokens") * <dollars per 1M tokens> / 1000000.
const tokenPriceScale = 1000000

// UnitPriceAdd raises the unit price of one usage field in one tier.
type UnitPriceAdd struct {
	Field string
	// Delta is added to the term's coefficient as written: dollars per unit
	// for a bare term, dollars per 1M units for a token term.
	Delta decimal.Decimal
	// PerMillion requires the canonical token shape u(f) * price / 1000000;
	// otherwise the term must be the bare u(f) * price.
	PerMillion bool
}

// AddTierUnitPrices returns the expression with each named tier's usage term
// coefficient raised by its delta. Conditions, other tiers and request rules
// stay as written, so the result keeps the canonical task shape. Every named
// tier must exist once and hold exactly one matching term.
func AddTierUnitPrices(exprStr string, adds map[string]UnitPriceAdd) (string, error) {
	_, body := ParseExprVersion(exprStr)
	tree, err := parser.Parse(body)
	if err != nil {
		return "", fmt.Errorf("parse billing expression: %w", err)
	}
	found := make(map[string]bool, len(adds))
	var prices []priceLiteral
	var walkErr error
	ast.Find(tree.Node, func(node ast.Node) bool {
		name, args := calledFunction(node)
		if name != "tier" || len(args) != 2 || walkErr != nil {
			return false
		}
		label, ok := args[0].(*ast.StringNode)
		if !ok {
			return false
		}
		add, ok := adds[label.Value]
		if !ok {
			return false
		}
		if found[label.Value] {
			walkErr = fmt.Errorf("tier %q appears more than once", label.Value)
			return true
		}
		found[label.Value] = true
		literal, err := unitPriceLiteral(args[1], add)
		if err != nil {
			walkErr = fmt.Errorf("tier %q: %w", label.Value, err)
			return true
		}
		literal.value = literal.value.Add(add.Delta)
		if literal.value.IsNegative() {
			walkErr = fmt.Errorf("tier %q: unit price would be negative", label.Value)
			return true
		}
		prices = append(prices, literal)
		return false
	})
	if walkErr != nil {
		return "", walkErr
	}
	for name := range adds {
		if !found[name] {
			return "", fmt.Errorf("tier %q not found", name)
		}
	}
	slices.SortFunc(prices, func(a, b priceLiteral) int { return b.from - a.from })
	// Node locations count runes, and tier names may be non-ASCII.
	source := []rune(body)
	for _, price := range prices {
		source = slices.Replace(source, price.from, price.to, []rune(price.value.String())...)
	}
	return exprStr[:len(exprStr)-len(body)] + string(source), nil
}

// unitPriceLiteral finds the single coefficient of add.Field in a tier body.
func unitPriceLiteral(body ast.Node, add UnitPriceAdd) (priceLiteral, error) {
	var matches []priceLiteral
	ast.Find(body, func(node ast.Node) bool {
		product := node
		if add.PerMillion {
			division, ok := node.(*ast.BinaryNode)
			if !ok || division.Operator != "/" {
				return false
			}
			scale, ok := numericLiteral(division.Right)
			if !ok || !scale.Equal(decimal.NewFromInt(tokenPriceScale)) {
				return false
			}
			product = division.Left
		}
		literal, ok := usageCoefficient(product, add.Field)
		if !ok {
			return false
		}
		if !add.PerMillion && isScaledTerm(body, product) {
			return false
		}
		matches = append(matches, literal)
		return false
	})
	if len(matches) != 1 {
		shape := "u(%q) * price"
		if add.PerMillion {
			shape = "u(%q) * price / 1000000"
		}
		return priceLiteral{}, fmt.Errorf("expected one term "+shape+", found %d", add.Field, len(matches))
	}
	return matches[0], nil
}

// usageCoefficient reads u(field) * literal or literal * u(field).
func usageCoefficient(node ast.Node, field string) (priceLiteral, bool) {
	product, ok := node.(*ast.BinaryNode)
	if !ok || product.Operator != "*" {
		return priceLiteral{}, false
	}
	for _, pair := range [][2]ast.Node{{product.Left, product.Right}, {product.Right, product.Left}} {
		name, args := calledFunction(pair[0])
		if name != "u" || len(args) != 1 {
			continue
		}
		key, ok := args[0].(*ast.StringNode)
		if !ok || key.Value != field {
			continue
		}
		value, ok := numericLiteral(pair[1])
		if !ok {
			return priceLiteral{}, false
		}
		location := pair[1].Location()
		return priceLiteral{from: location.From, to: location.To, value: value}, true
	}
	return priceLiteral{}, false
}

// isScaledTerm reports whether product is the left side of a "/ n" division,
// so a bare-term search does not take a token term's coefficient.
func isScaledTerm(body ast.Node, product ast.Node) bool {
	return ast.Find(body, func(node ast.Node) bool {
		division, ok := node.(*ast.BinaryNode)
		return ok && division.Operator == "/" && division.Left == product
	}) != nil
}
