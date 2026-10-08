import {JSX, Show} from 'solid-js';

/** A label/value row of the profile data, hidden when the value is missing. */
export default function VKProfileInfoRow(props: {label: string, children: JSX.Element}) {
  return (
    <Show when={props.children}>
      <div class="vk-profile-info-row">
        <dt>{props.label}</dt>
        <dd>{props.children}</dd>
      </div>
    </Show>
  );
}
