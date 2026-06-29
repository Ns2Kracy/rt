export function OutputBlock(props: { value: string; tone?: 'neutral' | 'error' }) {
  return (
    <pre
      class={[
        'min-h-28 overflow-auto rounded-md border p-3 text-xs leading-5 whitespace-pre-wrap wrap-break-word',
        {
          'border-slate-200 bg-slate-950 text-slate-100': props.tone !== 'error',
          'border-red-200 bg-red-50 text-red-900': props.tone === 'error',
        },
      ]}
    >
      {props.value || 'No output yet'}
    </pre>
  )
}
