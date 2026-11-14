type CopyKey =
  | 'hero'
  | 'heroReady'
  | 'animating'
  | 'result'
  | 'again'
  | 'empty'
  | 'button'
  | 'buttonAgain'

const COPY: Record<CopyKey, string[]> = {
  hero: [
    '今天又纠结什么了？',
    '这么多选择，你的大脑还好吗？',
    '人生已经够难了，这件事就别自己扛了。',
    '选择困难症晚期？别担心，我们有办法。',
    '把选择交给命运，把时间还给自己。',
  ],
  heroReady: [
    '别盯着了，它们不会自己选出来。',
    '准备好把决定权交出来了吗？',
    '它们已经等不及了，谁先被命运点名？',
    '再看下去，菜都要凉了。',
  ],
  animating: [
    '正在联系命运安排……',
    '宇宙正在认真考虑你的选择……',
    '正在召开紧急决策会议……',
    '请稍等，命运也需要思考一下。',
    '正在从无数可能性中寻找答案……',
    '别眨眼，答案正在路上。',
  ],
  result: [
    '好了，别反悔！',
    '命运说，就是它了！',
    '这次不许再挑三拣四了。',
    '结果已经出来了，接受现实吧。',
    '这就是今天的安排。',
    '命运已经拍板，抗议无效。',
  ],
  again: [
    '不满意？你这是不相信命运？',
    '好吧，再给你一次机会。',
    '刚才那个不算？行，再来。',
    '你是不是早就有答案了？',
    '命运说：行吧，这次重新来。',
  ],
  empty: [
    '这里空空如也。',
    '连命运都不知道怎么安排。',
    '先添加几个选择项，不然我也没办法。',
  ],
  button: ['帮我做决定', '交给命运', '别纠结了', '就选它吧', '命运揭晓'],
  buttonAgain: ['再给我一次机会', '命运，再安排一次', '我不服，再选一次', '这次能不能靠谱点'],
}

const lastPicked: Partial<Record<CopyKey, number>> = {}

/** Pick a line without immediately repeating the previous one for the same state. */
export function pickCopy(key: CopyKey): string {
  const pool = COPY[key]
  if (pool.length === 0) return ''
  let index = Math.floor(Math.random() * pool.length)
  if (pool.length > 1 && index === lastPicked[key]) {
    index = (index + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length
  }
  lastPicked[key] = index
  return pool[index]
}

export const EMPTY_SUB =
  '去设置里添加几个候选项吧，比如「今天吃什么」的名单。命运总得先知道有哪些选项。'

export const EMPTY_CTA = '去添加选择项'

export const NETWORK_COPY = '命运暂时失联，请检查网络后再试。'

export const SAVE_FAIL_COPY = '这次没记住，麻烦再试一次。'
