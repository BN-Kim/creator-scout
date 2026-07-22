import { RunDetailClient } from "./run-detail-client";

export default function RunDetailPage({ params }: { params: { id: string } }): React.ReactNode { return <RunDetailClient runId={params.id} />; }
