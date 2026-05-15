import { baseWarn, getAndRemoveAttr, getBindingAttr } from 'compiler/helpers'
import { parseText } from 'compiler/parser/text-parser'
import { hasOwn } from 'shared/util'
import { ASTElement, CompilerOptions, ModuleOptions } from 'types/compiler'
import { parseStyleText } from 'web/util/style'

function transformNode(el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn
  const staticStyle = getAndRemoveAttr(el, 'style')
  if (staticStyle) {
    /* istanbul ignore if */
    if (__DEV__) {
      const res = parseText(staticStyle, options.delimiters)
      if (res) {
        warn(
          `style="${staticStyle}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div style="{{ val }}">, use <div :style="val">.',
          el.rawAttrsMap['style']
        )
      }
    }
    el.staticStyle = JSON.stringify(parseStyleText(staticStyle))
  }

  const styleBinding = getBindingAttr(el, 'style', false /* getStatic */)
  if (styleBinding) {
    el.styleBinding = styleBinding
  }
}

function genData(el: ASTElement): string {
  let data = ''
  // guard against prototype pollution (CVE-2024-6783)
  if (hasOwn(el, 'staticStyle') && el.staticStyle) {
    data += `staticStyle:${el.staticStyle},`
  }
  if (hasOwn(el, 'styleBinding') && el.styleBinding) {
    data += `style:(${el.styleBinding}),`
  }
  return data
}

export default {
  staticKeys: ['staticStyle'],
  transformNode,
  genData
} as ModuleOptions
