import type { IconNode } from 'lucide'

interface IconProps {
  icon: IconNode
  class?: string
  title?: string
}

type IconElement = IconNode[number]

function renderIconElement([tag, attrs]: IconElement) {
  switch (tag) {
    case 'circle':
      return <circle {...attrs} />
    case 'ellipse':
      return <ellipse {...attrs} />
    case 'line':
      return <line {...attrs} />
    case 'path':
      return <path {...attrs} />
    case 'polygon':
      return <polygon {...attrs} />
    case 'polyline':
      return <polyline {...attrs} />
    case 'rect':
      return <rect {...attrs} />
    default:
      return null
  }
}

export function Icon(props: IconProps) {
  return (
    <svg
      aria-hidden={props.title ? undefined : 'true'}
      class={props.class}
      fill="none"
      height="24"
      role={props.title ? 'img' : undefined}
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {props.title ? <title>{props.title}</title> : null}
      {props.icon.map(renderIconElement)}
    </svg>
  )
}
