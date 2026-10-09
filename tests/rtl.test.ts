import { expect, mock, test } from 'claude-code/testing'

import { rtl } from '../hooks/register'

test('shapes letters and reverses an RTL line', async () => {
  expect(rtl('سلام')).toBe('ﻡﻼﺳ') // م + lam-alef (final) + س initial
  expect(rtl('پچ گژ ک ی')).toBe('ﯼ ﮎ ﮋﮔ ﭻﭘ')
})

test('keeps English words, numbers and inline code in their own order', async () => {
  expect(rtl('من با Python 3.12 کار می‌کنم.')).toBe('.ﻢﻨﮐ‌ﯽﻣ ﺭﺎﮐ Python 3.12 ﺎﺑ ﻦﻣ')
  expect(rtl('- فایل `config.json` را باز کنید (مهم)')).toBe('- (ﻢﻬﻣ) ﺪﯿﻨﮐ ﺯﺎﺑ ﺍﺭ `config.json` ﻞﯾﺎﻓ')
})

test('leaves English, code fences and LTR lines with a Persian word sensibly', async () => {
  expect(rtl('This is English only')).toBe('This is English only')
  expect(rtl('```\nسلام code\n```')).toBe('```\nسلام code\n```')
  expect(rtl('The word سلام دنیا is Persian')).toBe('The word ﺎﯿﻧﺩ ﻡﻼﺳ is Persian')
})

test('wraps long RTL lines so the first words stay on top', async () => {
  const out = rtl('این یک جمله خیلی طولانی است که باید شکسته شود', 20).split('\n')
  expect(out.length).toBeGreaterThan(1)
  expect(out[0]!.endsWith('ﻦﯾﺍ')).toBe(true)
})

test('rewrites the drawn reply on the terminal only, and /rtl off stops it', async ($, on) => {
  mock.store(on)
  const drawn: string[] = []
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    drawn.push(e.props.text)
    return { type: 'Text', props: {}, children: [] } as never
  })
  const props = { text: 'سلام', isFirstOfReply: true }
  await $.ui.render({ surface: 'terminal', component: 'AssistantMessage', requestId: 'm1', props })
  await $.ui.render({ surface: 'desktop', component: 'AssistantMessage', requestId: 'm1', props })
  await $.command.run({ command: 'rtl', args: 'off' } as never) // the engine stamps origin and presentation
  await $.ui.render({ surface: 'terminal', component: 'AssistantMessage', requestId: 'm1', props })
  expect(drawn).toEqual([rtl('سلام', 76), 'سلام', 'سلام'])
})
