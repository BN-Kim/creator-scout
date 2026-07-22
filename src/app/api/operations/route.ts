import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { automaticRunConfigurationSchema } from "@/server/operations/automatic-run-configuration";
import { loadOperationConfig } from "@/server/operations/operation-config";
import { ensureOperationRuntime } from "@/server/operations/operation-runtime";
import { getServerOperationRepository } from "@/server/operations/server-operation-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause"), reason: z.string().trim().max(200).default("수동 운영 중지") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("run_due") }),
  z.object({
    action: z.literal("create_schedule"), name: z.string().trim().min(1).max(100), intervalMinutes: z.number().int().min(1).max(10_080),
    nextRunAt: z.string().datetime().optional(), maxRetries: z.number().int().min(0).max(10).optional(),
    request: automaticRunConfigurationSchema,
  }),
  z.object({ action: z.literal("set_schedule_enabled"), id: z.string().trim().min(1), enabled: z.boolean() }),
]);

export async function GET(): Promise<NextResponse> {
  ensureOperationRuntime();
  return NextResponse.json(snapshot());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = await parseAction(request);
  if (!parsed) return NextResponse.json({ message: "운영 요청값이 올바르지 않습니다." }, { status: 400 });
  const repository = getServerOperationRepository();
  const runtimeState = ensureOperationRuntime();
  const now = new Date();
  try {
    switch (parsed.action) {
      case "pause": repository.setPaused(true, parsed.reason, now.toISOString()); break;
      case "resume": repository.setPaused(false, null, now.toISOString()); break;
      case "run_due": await runtimeState.scheduler.tick(); break;
      case "create_schedule": {
        const config = loadOperationConfig();
        repository.createSchedule({
          id: `schedule-${randomUUID()}`, name: parsed.name, intervalMinutes: parsed.intervalMinutes,
          request: parsed.request,
          nextRunAt: parsed.nextRunAt ?? new Date(now.getTime() + parsed.intervalMinutes * 60_000).toISOString(),
          maxRetries: parsed.maxRetries ?? config.defaultMaxRetries, now: now.toISOString(),
        });
        break;
      }
      case "set_schedule_enabled": repository.setScheduleEnabled(parsed.id, parsed.enabled, now.toISOString()); break;
    }
    return NextResponse.json(snapshot());
  } catch {
    return NextResponse.json({ message: "운영 상태를 변경하지 못했습니다." }, { status: 500 });
  }
}

function snapshot(): object {
  const repository = getServerOperationRepository();
  return {
    monitoring: repository.getMonitoringSnapshot(new Date().toISOString()),
    schedules: repository.listSchedules(), executions: repository.listExecutions(25), events: repository.listEvents(50),
  };
}

async function parseAction(request: NextRequest): Promise<z.infer<typeof actionSchema> | null> {
  try {
    const result = actionSchema.safeParse(await request.json() as unknown);
    return result.success ? result.data : null;
  } catch { return null; }
}
