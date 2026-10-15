import { AuditLogType } from "../api/explorer";

const eventNames = Object.fromEntries(Object.entries(AuditLogType).map(([name, id]) => [id, name]));
export const getEventName = (id: number) => eventNames[id] ?? `event_${id}`;
