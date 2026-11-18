package billingexpr

import (
	"fmt"
	"slices"
	"strings"
	"unicode"

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
	return rewritePrices(exprStr, factor, false)
}

// PublishPrices is ScalePrices for viewers who may not learn the supply price.
// A usage term whose price is a product of several numbers, such as
// u("seconds") * 0.39 * 1.3 / 6.8, also becomes one unit price, so the term
// shows neither the supply price, the markup nor the exchange rate; a
// / 1000000 per-million divisor stays as written.
func PublishPrices(exprStr string, factor decimal.Decimal) (string, error) {
	return rewritePrices(exprStr, factor, true)
}

func rewritePrices(exprStr string, factor decimal.Decimal, fold bool) (string, error) {
	_, body := ParseExprVersion(exprStr)
	tree, err := parser.Parse(body)
	if err != nil {
		return "", fmt.Errorf("parse billing expression: %w", err)
	}
	source := []rune(body)
	scaler := &priceScaler{source: source, fold: fold}
	if err := scaler.scale(tree.Node); err != nil {
		return "", err
	}
	slices.SortFunc(scaler.edits, func(a, b priceEdit) int { return b.from - a.from })

	for _, edit := range scaler.edits {
		text := ""
		if edit.price != nil {
			price := edit.price.Mul(factor)
			if edit.divisor != nil {
				price = price.DivRound(*edit.divisor, foldedPricePlaces)
			}
			text = price.String()
		}
		source = slices.Replace(source, edit.from, edit.to, []rune(text)...)
	}
	return exprStr[:len(exprStr)-len(body)] + string(source), nil
}

type priceLiteral struct {
	from, to int
	value    decimal.Decimal
}

// priceEdit replaces the runes from..to of the expression body with price
// times the factor, divided by divisor when set, or removes them when price is
// nil.
type priceEdit struct {
	from, to int
	price    *decimal.Decimal
	divisor  *decimal.Decimal
}

// foldedPricePlaces is the decimal places of a unit price folded from a
// division; the view is display-only, so the last places do not matter.
const foldedPricePlaces = 12

type priceScaler struct {
	// source is the expression body; node locations count runes, and tier
	// names may be non-ASCII.
	source []rune
	edits  []priceEdit
	// fold turns each product of usage and numbers into one unit price.
	fold bool
}

// scale marks the literals that carry the money in node, whose value is a cost.
func (s *priceScaler) scale(node ast.Node) error {
	if value, ok := numericLiteral(node); ok {
		location := node.Location()
		s.edits = append(s.edits, priceEdit{from: location.From, to: location.To, price: &value})
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
		if s.fold && (typed.Operator == "*" || typed.Operator == "/") && s.foldUsagePrice(typed) {
			return nil
		}
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
	marked := len(s.edits)
	if s.scale(first) == nil {
		return nil
	}
	s.edits = s.edits[:marked]
	return s.scale(second)
}

// perMillion is the divisor of a token price written per million tokens.
var perMillion = decimal.NewFromInt(1_000_000)

// productNumber is a numeric literal of a usage term and the operator in front
// of it, or op -1 for a leading literal.
type productNumber struct {
	value   decimal.Decimal
	from    int
	to      int
	op      int
	divisor bool
}

// foldUsagePrice rewrites a usage term such as u("seconds") * 0.39 * 1.3 / 6.8
// into one unit price: the first multiplied literal becomes the product of all
// its numbers and the other numbers are removed, except one / 1000000. It
// reports false, leaving the term to the literal-by-literal rule, for any
// other shape: a tier() or fixed() factor, a factor holding numbers of its own
// such as a request multiplier, a non-literal divisor, or no usage factor.
func (s *priceScaler) foldUsagePrice(node *ast.BinaryNode) bool {
	var numbers []productNumber
	usage := 0
	if !s.collectProduct(node, -1, &numbers, &usage) || usage == 0 {
		return false
	}
	kept := -1
	keptPerMillion := false
	price := decimal.NewFromInt(1)
	divisor := decimal.NewFromInt(1)
	var removed []productNumber
	for i, number := range numbers {
		switch {
		case number.divisor && !keptPerMillion && number.value.Equal(perMillion):
			keptPerMillion = true
		case number.divisor:
			divisor = divisor.Mul(number.value)
			removed = append(removed, number)
		case kept == -1:
			kept = i
			price = price.Mul(number.value)
		default:
			price = price.Mul(number.value)
			removed = append(removed, number)
		}
	}
	if kept == -1 || divisor.IsZero() {
		return false
	}
	edits := make([]priceEdit, 0, len(removed)+1)
	for _, number := range removed {
		// A removed number goes with its operator, and only whitespace may sit
		// between them; anything else, such as a bracket, keeps the old rule.
		if number.op < 0 || strings.TrimSpace(string(s.source[number.op+1:number.from])) != "" {
			return false
		}
		start := number.op
		for start > 0 && unicode.IsSpace(s.source[start-1]) {
			start--
		}
		edits = append(edits, priceEdit{from: start, to: number.to})
	}
	folded := priceEdit{from: numbers[kept].from, to: numbers[kept].to, price: &price}
	if !divisor.Equal(decimal.NewFromInt(1)) {
		folded.divisor = &divisor
	}
	edits = append(edits, folded)
	s.edits = append(s.edits, edits...)
	return true
}

// collectProduct gathers the numbers and counts the usage factors of a chain
// of * and /, where op is the location of the operator in front of node.
func (s *priceScaler) collectProduct(node ast.Node, op int, numbers *[]productNumber, usage *int) bool {
	if value, ok := numericLiteral(node); ok {
		location := node.Location()
		*numbers = append(*numbers, productNumber{value: value, from: location.From, to: location.To, op: op})
		return true
	}
	if binary, ok := node.(*ast.BinaryNode); ok {
		switch binary.Operator {
		case "*":
			return s.collectProduct(binary.Left, op, numbers, usage) &&
				s.collectProduct(binary.Right, binary.Location().From, numbers, usage)
		case "/":
			value, ok := numericLiteral(binary.Right)
			if !ok || !s.collectProduct(binary.Left, op, numbers, usage) {
				return false
			}
			location := binary.Right.Location()
			*numbers = append(*numbers, productNumber{
				value: value, from: location.From, to: location.To, op: binary.Location().From, divisor: true,
			})
			return true
		}
	}
	// A usage factor such as u("seconds") or p holds no number and no price.
	if containsTier(node) || ast.Find(node, func(candidate ast.Node) bool {
		_, isNumber := numericLiteral(candidate)
		name, _ := calledFunction(candidate)
		return isNumber || name == "fixed"
	}) != nil {
		return false
	}
	*usage++
	return true
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
