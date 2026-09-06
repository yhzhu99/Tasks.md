import { useTeamText } from "../team-session";

export function LoadError(props) {
  const text = useTeamText();
  return <div class="load-error" role="alert">
    <strong>{text("暂时无法加载", "Unable to load")}</strong>
    <p>{props.message}</p>
    <button type="button" disabled={props.busy} onClick={props.onRetry}>{text("重试", "Retry")}</button>
  </div>;
}
