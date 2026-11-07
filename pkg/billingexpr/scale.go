package billingexpr

import (
	"fmt"
	"slices"

	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
	"github.com/shopspring/decimal"
)

// ScalePrices returns the expression with its result multiplied by factor,
// by rewriting the price literals in place. Conditions, thresholds, divisors,
// free allowances and request multipliers stay as written, so the result keeps
// the shape display parsers expect and contains no unscaled price.
//
// It returns an error for an expression whose prices it cannot locate, such as
// a usage term with no coefficient. Callers publishing the result must then
// withhold the expression rather than fall back to the original.
func ScalePrices(exprStr string, factor decimal.Decimal) (string, error) {
	_, body := ParseExprVersion(exprStr)
	tree, err := parser.Parse(body)
	if err != nil {
		return "", fmt.Errorf("parse billing expression: %w", err)
	}
	scaler := &priceScaler{}
	if err := scaler.scale(tree.Node); err != nil {
		return "", err
	}
	slices.SortFunc(scaler.prices, func(a, b priceLiteral) int { return b.from - a.from })

	// Node locations count runes, and tier names may be non-ASCII.
	source := []rune(body)
	for _, price := range scaler.prices {
		scaled := []rune(price.value.Mul(factor).String())
		source = slices.Replace(source, price.from, price.to, scaled...)
	}
	return exprStr[:len(exprStr)-len(body)] + string(source), nil
}

type priceLiteral struct {
	from, to int
	value    decimal.Decimal
}

type priceScaler struct {
	prices []priceLiteral
}

// scale marks the literals that carry the money in node, whose value is a cost.
func (s *priceScaler) scale(node ast.Node) error {
	if value, ok := numericLiteral(node); ok {
		location := node.Location()
		s.prices = append(s.prices, priceLiteral{from: location.From, to: location.To, value: value})
		return nil
	}
	if name, args := calledFunction(node); name != "" {
		switch {
		case name == "tier" && len(args) == 2:
			return s.scale(args[1])
		case name == "fixed" && len(args) == 1:
			return s.scale(args[0])
		case name == "max" || name == "min":
			return s.scaleAll(args...)
		}
		return fmt.Errorf("cannot locate prices in %s()", name)
	}
	switch typed := node.(type) {
	case *ast.ConditionalNode:
		return s.scaleAll(typed.Exp1, typed.Exp2)
	case *ast.BinaryNode:
		switch typed.Operator {
		case "+", "-":
			return s.scaleAll(typed.Left, typed.Right)
		case "/":
			return s.scale(typed.Left)
		case "*":
			return s.scaleProduct(typed)
		}
	}
	return fmt.Errorf("cannot locate prices in %q", node.String())
}

func (s *priceScaler) scaleAll(nodes ...ast.Node) error {
	for _, node := range nodes {
		if err := s.scale(node); err != nil {
			return err
		}
	}
	return nil
}

// scaleProduct scales exactly one factor of a product. A tier() factor comes
// first because the factor beside it is a request multiplier, not a price.
func (s *priceScaler) scaleProduct(node *ast.BinaryNode) error {
	first, second := node.Left, node.Right
	if !containsTier(first) {
		_, secondIsLiteral := numericLiteral(second)
		if containsTier(second) || secondIsLiteral {
			first, second = second, first
		}
	}
	marked := len(s.prices)
	if s.scale(first) == nil {
		return nil
	}
	s.prices = s.prices[:marked]
	return s.scale(second)
}

func numericLiteral(node ast.Node) (decimal.Decimal, bool) {
	switch typed := node.(type) {
	case *ast.IntegerNode:
		return decimal.NewFromInt(int64(typed.Value)), true
	case *ast.FloatNode:
		return decimal.NewFromFloat(typed.Value), true
	}
	return decimal.Zero, false
}

func calledFunction(node ast.Node) (string, []ast.Node) {
	switch typed := node.(type) {
	case *ast.CallNode:
		if callee, ok := typed.Callee.(*ast.IdentifierNode); ok {
			return callee.Value, typed.Arguments
		}
	case *ast.BuiltinNode:
		return typed.Name, typed.Arguments
	}
	return "", nil
}

func containsTier(node ast.Node) bool {
	return ast.Find(node, func(candidate ast.Node) bool {
		name, _ := calledFunction(candidate)
		return name == "tier"
	}) != nil
}
