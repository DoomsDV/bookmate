type IconProps = {
	class?: string;
};

/** Íconos de marca (SVG) — Material Symbols no incluye logos oficiales. */
export function FacebookIcon({ class: className = '' }: IconProps) {
	return (
		<svg
			class={className}
			viewBox="0 0 24 24"
			width="20"
			height="20"
			aria-hidden="true"
			fill="currentColor"
		>
			<path d="M14.5 8.5V6.8c0-.7.1-1.1 1.2-1.1H17V3h-2.3C11.9 3 11 4.5 11 6.6v1.9H9v2.8h2V21h3.5v-9.7h2.3l.4-2.8H14.5z" />
		</svg>
	);
}

export function InstagramIcon({ class: className = '' }: IconProps) {
	return (
		<svg
			class={className}
			viewBox="0 0 24 24"
			width="20"
			height="20"
			aria-hidden="true"
			fill="currentColor"
		>
			<path d="M12 7.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2z" />
			<path d="M17.5 6.3a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0z" />
			<path d="M12 3.5c-2.4 0-2.7 0-3.7.1-1.7.1-3.1 1.5-3.2 3.2-.1 1-.1 1.3-.1 3.7s0 2.7.1 3.7c.1 1.7 1.5 3.1 3.2 3.2 1 .1 1.3.1 3.7.1s2.7 0 3.7-.1c1.7-.1 3.1-1.5 3.2-3.2.1-1 .1-1.3.1-3.7s0-2.7-.1-3.7c-.1-1.7-1.5-3.1-3.2-3.2-1-.1-1.3-.1-3.7-.1zm0 1.5c2.3 0 2.6 0 3.5.1 1.2.1 1.9.8 1.9 1.9.1.9.1 1.2.1 3.5s0 2.6-.1 3.5c-.1 1.1-.7 1.8-1.9 1.9-.9.1-1.2.1-3.5.1s-2.6 0-3.5-.1c-1.2-.1-1.9-.8-1.9-1.9-.1-.9-.1-1.2-.1-3.5s0-2.6.1-3.5c.1-1.1.7-1.8 1.9-1.9.9-.1 1.2-.1 3.5-.1z" />
		</svg>
	);
}
