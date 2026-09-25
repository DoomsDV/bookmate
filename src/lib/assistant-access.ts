import { CAPABILITIES } from '../config/capabilities';
import { isAssistantAgentConfigured } from './assistant-agent';

type AssistantLocals = {
	token?: string;
	capabilities?: unknown;
	userId?: unknown;
	organizationId?: unknown;
};

/** Si la sesión puede usar a Numa: es la condición con la que el Layout monta el asistente en el panel. */
export const canUseAssistant = (locals: AssistantLocals) =>
	Boolean(locals.token) &&
	isAssistantAgentConfigured() &&
	Array.isArray(locals.capabilities) &&
	locals.capabilities.includes(CAPABILITIES.ASSISTANT_USE) &&
	Number(locals.userId || 0) > 0 &&
	Number(locals.organizationId || 0) > 0;
