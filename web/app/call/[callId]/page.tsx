import CallRoom from "@/components/CallRoom";

export default function CallPage({ params, searchParams }: {
  params: { callId: string };
  searchParams: { as?: string; invite?: string; review?: string };
}) {
  const me = searchParams.as === "user-a" || searchParams.as === "user-b" ? searchParams.as : null;
  return <CallRoom callId={params.callId} me={me} showInvite={searchParams.invite === "1"} review={searchParams.review === "1"} />;
}
