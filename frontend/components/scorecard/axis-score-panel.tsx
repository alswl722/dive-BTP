import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBar } from "@/components/ui/score-bar";
import { AXES, type AxisScores } from "@/types";

/** 4축 점수 패널 + '축 어긋남' 하이라이트.
 *  종합점수는 만들지 않는다 — 축 어긋남(고성장·저수익 등)을 뭉개지 않는 게 도구 핵심. */
export function AxisScorePanel({ scores }: { scores: AxisScores }) {
  const vals = AXES.map((a) => scores[a]).filter((v): v is number => v != null);
  const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  const misaligned = spread >= 30; // 축 간 격차 큼 = 겹쳐읽기 필요 신호

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>재무 축별 점수 <span className="font-normal">(업종 대비 백분위, 0~100)</span></CardTitle>
        {misaligned && <Badge variant="warn">축 어긋남 — 겹쳐읽기 필요</Badge>}
      </CardHeader>
      <CardContent className="space-y-3.5">
        {AXES.map((a) => (
          <ScoreBar key={a} label={a} value={scores[a]} />
        ))}
        {misaligned && (
          <p className="pt-1 text-xs text-muted-foreground">
            축 간 점수 격차가 큽니다. 한 축만 보지 말고 성장·수익·효율·안정을 함께 판단하세요.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
