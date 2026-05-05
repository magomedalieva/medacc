import { Navigate, useParams } from "react-router-dom";

import { TestsSessionExperience } from "../components/TestsSessionExperience";

export function TestSessionPage() {
  const { sessionId } = useParams();

  if (!sessionId) {
    return <Navigate replace to="/app/practice" />;
  }

  return <TestsSessionExperience sessionId={sessionId} />;
}
