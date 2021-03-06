import {
  findIndex,
  findLastIndex,
  range,
} from "lodash"
import valueParser from "postcss-value-parser"
import {
  blurComments,
  hasBlock,
  beforeBlockString,
  report,
  ruleMessages,
  styleSearch,
  validateOptions,
} from "../../utils"
import { lengthUnits } from "../../reference/keywordSets"

export const ruleName = "number-zero-length-no-unit"

export const messages = ruleMessages(ruleName, {
  rejected: "Unexpected unit on zero length number",
})

export default function (actual) {
  return (root, result) => {
    const validOptions = validateOptions(result, ruleName, { actual })
    if (!validOptions) { return }

    root.walkDecls(decl => {
      check(blurComments(decl.toString()), decl)
    })

    root.walkAtRules(atRule => {
      const source = (hasBlock(atRule))
        ? beforeBlockString(atRule, { noRawBefore: true })
        : atRule.toString()
      check(source, atRule)
    })

    function check(value, node) {
      const ignorableIndexes = new Set()

      styleSearch({ source: value, target: "0" }, match => {
        const index = match.startIndex

        // Given a 0 somewhere in the full property value (not in a string, thanks
        // to styleSearch) we need to isolate the value that contains the zero.
        // To do so, we'll find the last index before the 0 of a character that would
        // divide one value in a list from another, and the next index of such a
        // character; then we build a substring from those indexes, which we can
        // assess.

        // If a single value includes multiple 0's (e.g. 100.01px), we don't want
        // each 0 to be treated as a separate value, possibly resulting in multiple
        // warnings for the same value (e.g. 0.00px).
        //
        // This check prevents that from happening: we build and check against a
        // Set containing all the indexes that are part of a value already validated.
        if (ignorableIndexes.has(index)) { return }

        const prevValueBreakIndex = findLastIndex(value.substr(0, index), char => {
          return [ " ", ",", ")", "(", "#" ].indexOf(char) !== -1
        })

        // Ignore hex colors
        if (value[prevValueBreakIndex] === "#") { return }

        // If no prev break was found, this value starts at 0
        const valueWithZeroStart = (prevValueBreakIndex === -1)
          ? 0
          : prevValueBreakIndex + 1

        const nextValueBreakIndex = findIndex(value.substr(valueWithZeroStart), char => {
          return [ " ", ",", ")" ].indexOf(char) !== -1
        })

        // If no next break was found, this value ends at the end of the string
        const valueWithZeroEnd = (nextValueBreakIndex === -1)
          ? value.length
          : nextValueBreakIndex + valueWithZeroStart

        const valueWithZero = value.slice(valueWithZeroStart, valueWithZeroEnd)
        const parsedValue = valueParser.unit(valueWithZero)

        if (!parsedValue || (parsedValue && !parsedValue.unit)) { return }

        // Add the indexes to ignorableIndexes so the same value will not
        // be checked multiple times.
        range(valueWithZeroStart, valueWithZeroEnd).forEach(i => ignorableIndexes.add(i))

        // Only pay attention if the value parses to 0
        // and units with lengths
        if (parseFloat(valueWithZero, 10) !== 0
          || !lengthUnits.has(parsedValue.unit.toLowerCase())
        ) { return }

        report({
          message: messages.rejected,
          node,
          index: valueWithZeroEnd - parsedValue.unit.length,
          result,
          ruleName,
        })
      })
    }
  }
}
