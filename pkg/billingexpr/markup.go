package billingexpr

import (
	"errors"
	"fmt"
	"slices"

	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
	"github.com/shopspring/decimal"
)

// markupDigits is the precision of a rewritten price literal.
const markupDigits = 12

var oneMillion = decimal.NewFromInt(1_000_000)

// UnitPriceAdd raises, or with a negative delta lowers, the unit price of one
// usage field in one tier.
type UnitPriceAdd struct {
	Field string
	// Delta is added to the term's effective coefficient: dollars per unit,
	// or dollars per 1M units when PerMillion is set.
	Delta      decimal.Decimal
	PerMillion bool
}

// AddTierUnitPrices returns the expression with each named tier's usage term
// raised by its delta. A term is u(field) multiplied and divided by numeric
// literals, such as u("seconds") * 0.5, u("tokens") * 28 / 1000000 or
// u("seconds") * 20000 * 12 / 7 / 1000000. Only its outermost multiplier
// literal is rewritten, so divisors, conditions, other tiers and request rules
// stay as written. Every named tier must exist once and hold exactly one term
// for its field.
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
		literal, err := raisedUnitPrice(args[1], add)
		if err != nil {
			walkErr = fmt.Errorf("tier %q: %w", label.Value, err)
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

// usageTerm is u(field) times and divided by numeric literals.
type usageTerm struct {
	field       string
	coefficient decimal.Decimal
	// multipliers are the literals multiplying u(field), innermost first.
	multipliers []priceLiteral
}

// raisedUnitPrice finds the single term of add.Field in a tier body and
// returns its outermost multiplier literal raised so the term's coefficient
// grows by the delta.
func raisedUnitPrice(body ast.Node, add UnitPriceAdd) (priceLiteral, error) {
	var matches []usageTerm
	collectUsageTerms(body, add.Field, &matches)
	if len(matches) != 1 {
		return priceLiteral{}, fmt.Errorf("expected one term of u(%q) times a price, found %d", add.Field, len(matches))
	}
	term := matches[0]
	if len(term.multipliers) == 0 || term.coefficient.IsZero() {
		return priceLiteral{}, fmt.Errorf("the term of u(%q) has no price to raise", add.Field)
	}
	delta := add.Delta
	if add.PerMillion {
		delta = delta.Div(oneMillion)
	}
	literal := term.multipliers[len(term.multipliers)-1]
	// The literal is coefficient / rest, so raising the coefficient by delta
	// raises the literal by delta / rest = delta * literal / coefficient.
	raised := literal.value.Add(delta.Mul(literal.value).DivRound(term.coefficient, markupDigits))
	if !raised.IsPositive() {
		return priceLiteral{}, errors.New("unit price would not be above 0")
	}
	literal.value = raised
	return literal, nil
}

// collectUsageTerms appends every maximal term of field under node.
func collectUsageTerms(node ast.Node, field string, terms *[]usageTerm) {
	if term, ok := readUsageTerm(node); ok {
		if term.field == field {
			*terms = append(*terms, term)
		}
		return
	}
	switch typed := node.(type) {
	case *ast.BinaryNode:
		collectUsageTerms(typed.Left, field, terms)
		collectUsageTerms(typed.Right, field, terms)
	case *ast.UnaryNode:
		collectUsageTerms(typed.Node, field, terms)
	case *ast.ConditionalNode:
		collectUsageTerms(typed.Cond, field, terms)
		collectUsageTerms(typed.Exp1, field, terms)
		collectUsageTerms(typed.Exp2, field, terms)
	case *ast.CallNode:
		for _, arg := range typed.Arguments {
			collectUsageTerms(arg, field, terms)
		}
	case *ast.BuiltinNode:
		for _, arg := range typed.Arguments {
			collectUsageTerms(arg, field, terms)
		}
	}
}

// readUsageTerm reads node as one u() call combined with literals by * and /,
// where every divisor is a literal.
func readUsageTerm(node ast.Node) (usageTerm, bool) {
	part, ok := readTermPart(node)
	if !ok || part.field == "" {
		return usageTerm{}, false
	}
	return part, true
}

// readTermPart reads a literal, a u() call, or a product or quotient of them.
// A part without a u() call has an empty field.
func readTermPart(node ast.Node) (usageTerm, bool) {
	if value, ok := numericLiteral(node); ok {
		location := node.Location()
		return usageTerm{coefficient: value, multipliers: []priceLiteral{{from: location.From, to: location.To, value: value}}}, true
	}
	if name, args := calledFunction(node); name == "u" && len(args) == 1 {
		key, ok := args[0].(*ast.StringNode)
		if !ok {
			return usageTerm{}, false
		}
		return usageTerm{field: key.Value, coefficient: decimal.NewFromInt(1)}, true
	}
	binary, ok := node.(*ast.BinaryNode)
	if !ok {
		return usageTerm{}, false
	}
	left, ok := readTermPart(binary.Left)
	if !ok {
		return usageTerm{}, false
	}
	switch binary.Operator {
	case "*":
		right, ok := readTermPart(binary.Right)
		if !ok || (left.field != "" && right.field != "") {
			return usageTerm{}, false
		}
		return usageTerm{
			field:       left.field + right.field,
			coefficient: left.coefficient.Mul(right.coefficient),
			multipliers: slices.Concat(left.multipliers, right.multipliers),
		}, true
	case "/":
		divisor, ok := numericLiteral(binary.Right)
		if !ok || divisor.IsZero() {
			return usageTerm{}, false
		}
		left.coefficient = left.coefficient.DivRound(divisor, 24)
		return left, true
	}
	return usageTerm{}, false
}
