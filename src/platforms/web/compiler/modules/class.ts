import { baseWarn, getAndRemoveAttr, getBindingAttr } from 'compiler/helpers'
import { parseText } from 'compiler/parser/text-parser'
import { hasOwn } from 'shared/util'
import { ASTElement, CompilerOptions, ModuleOptions } from 'types/compiler'

function transformNode(el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn
  const staticClass = getAndRemoveAttr(el, 'class')
  if (__DEV__ && staticClass) {
    const res = parseText(staticClass, options.delimiters)
    if (res) {
      warn(
        `class="${staticClass}": ` +
          'Interpolation inside attributes has been removed. ' +
          'Use v-bind or the colon shorthand instead. For example, ' +
          'instead of <div class="{{ val }}">, use <div :class="val">.',
        el.rawAttrsMap['class']
      )
    }
  }
  if (staticClass) {
    el.staticClass = JSON.stringify(staticClass.replace(/\s+/g, ' ').trim())
  }
  const classBinding = getBindingAttr(el, 'class', false /* getStatic */)
  if (classBinding) {
    el.classBinding = classBinding
  }
}

function genData(el: ASTElement): string {
  let data = ''
  // guard against prototype pollution (CVE-2024-6783)
  if (hasOwn(el, 'staticClass') && el.staticClass) {
    data += `staticClass:${el.staticClass},`
  }
  if (hasOwn(el, 'classBinding') && el.classBinding) {
    data += `class:${el.classBinding},`
  }
  return data
}

export default {
  staticKeys: ['staticClass'],
  transformNode,
  genData
} as ModuleOptions
