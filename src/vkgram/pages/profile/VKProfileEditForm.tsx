import {createEffect, createResource, createSignal, onCleanup, onMount, Show} from 'solid-js';
import type {User, UserFull} from '@layer';
import rootScope from '@lib/rootScope';
import ListenerSetter from '@helpers/listenerSetter';
import InputField from '@components/inputField';
import {InputFieldTsx} from '@components/inputFieldTsx';
import {UsernameInputField} from '@components/usernameInputField';
import {toastNew} from '@components/toast';
import getPeerEditableUsername from '@appManagers/utils/peers/getPeerEditableUsername';

/**
 * Functional edit form for «Моя страница». VKgram markup, Web K logic: the
 * same input components and the same manager calls as Web K's own edit
 * profile tab (sidebarLeft/tabs/editProfile.tsx) — updateProfile for the
 * names + bio, updateUsername for the username (with its live availability
 * check). The saved values reach the page through Web K's peer stores.
 *
 * Two looks, one logic (`variant`):
 *  - `block` (default) — a white block inside a page («Моя страница»);
 *  - `bare` — fields and actions only, no block and no title of its own:
 *    «Настройки → Профиль» holds the piece inside its own headed item;
 *  - `modal` — the body and the footer of a `VKModal` («Моя страница»: the
 *    modal draws the title and «×», Escape belongs to the modal).
 * `onSavingChange` tells the host that a save is in flight, so a modal can
 * hold its «×» / Escape until it is over.
 */
export default function VKProfileEditForm(props: {
  user: User.user,
  userFull?: UserFull.userFull,
  onDone: () => void,
  variant?: 'block' | 'bare' | 'modal',
  onSavingChange?: (saving: boolean) => void
}) {
  const isModal = props.variant === 'modal';
  const isBare = props.variant === 'bare';
  const managers = rootScope.managers;
  const listenerSetter = new ListenerSetter();
  onCleanup(() => listenerSetter.removeAll());

  const [bioMaxLength] = createResource(() => managers.apiManager.getLimit('bio'));
  const [saving, setSaving] = createSignal(false);
  const [canSave, setCanSave] = createSignal(false);
  createEffect(() => props.onSavingChange?.(saving()));
  // a modal reports «not saving» when it goes away, so the host is never left holding
  onCleanup(() => props.onSavingChange?.(false));

  let firstNameField: InputField;
  let lastNameField: InputField;
  let bioField: InputField;
  const usernameField = new UsernameInputField({
    label: 'EditProfile.Username.Label',
    name: 'username',
    plainText: true,
    listenerSetter,
    onChange: () => updateCanSave(),
    availableText: 'EditProfile.Username.Available',
    takenText: 'EditProfile.Username.Taken',
    invalidText: 'EditProfile.Username.Invalid'
  }, managers);

  // the bio field appears once its length limit has loaded
  const isProfileChanged = () =>
    firstNameField.isChanged() || lastNameField.isChanged() || !!bioField?.isChanged();

  // mirrors Web K's EditPeer rules: a first name is required, a changed
  // username must be valid and available
  const updateCanSave = () => {
    if(!firstNameField || !lastNameField) return;
    const usernameOk = !usernameField.isChanged() || usernameField.isValidToChange();
    setCanSave(
      !!firstNameField.value.trim() &&
      usernameOk &&
      (isProfileChanged() || usernameField.isChanged())
    );
  };

  const trackField = (field: InputField) => {
    listenerSetter.add(field.input)('input', updateCanSave);
  };

  onMount(() => {
    firstNameField.setOriginalValue(props.user.first_name, true);
    lastNameField.setOriginalValue(props.user.last_name, true);
    usernameField.setOriginalValue(getPeerEditableUsername(props.user), true);
    updateCanSave();
    // a modal moves the focus itself, once it is in the document (and not onto a touch keyboard)
    if(!isModal) firstNameField.input.focus();
  });

  const onSubmit = async(e: Event) => {
    e.preventDefault();
    if(!canSave() || saving()) return;
    setSaving(true);

    const promises: Promise<any>[] = [];
    if(isProfileChanged()) {
      promises.push(managers.appProfileManager.updateProfile(
        firstNameField.value,
        lastNameField.value,
        // never send an empty bio just because its field hasn't loaded yet
        bioField ? bioField.value : props.userFull?.about
      ));
    }

    if(usernameField.isValidToChange()) {
      promises.push(managers.appUsersManager.updateUsername(usernameField.value));
    }

    try {
      await Promise.all(promises);
      props.onDone();
    } catch(err) {
      console.error('VKgram: profile save failed', err);
      toastNew({langPackKey: 'Error.AnError'});
      setSaving(false);
    }
  };

  const fields = () => (
    <>
      <InputFieldTsx
        label="EditProfile.FirstNameLabel"
        name="first-name"
        maxLength={70}
        instanceRef={(ref) => {
          firstNameField = ref;
          trackField(ref);
        }}
      />
      <InputFieldTsx
        label="Login.Register.LastName.Placeholder"
        name="last-name"
        maxLength={64}
        instanceRef={(ref) => {
          lastNameField = ref;
          trackField(ref);
        }}
      />
      {usernameField.container}
      <Show when={bioMaxLength()} keyed>
        {(maxLength) => (
          <InputFieldTsx
            label="EditProfile.BioLabel"
            name="bio"
            maxLength={maxLength}
            instanceRef={(ref) => {
              bioField = ref;
              trackField(ref);
              ref.setOriginalValue(props.userFull?.about, true);
              updateCanSave();
            }}
          />
        )}
      </Show>
    </>
  );

  const saveButton = () => (
    <button type="submit" class="vk-button" disabled={!canSave() || saving()}>
      {saving() ? 'Сохранение…' : 'Сохранить'}
    </button>
  );
  const cancelButton = () => (
    <button type="button" class="vk-button vk-button-secondary" disabled={saving()} onClick={() => props.onDone()}>
      Отмена
    </button>
  );

  if(isModal) {
    return (
      <form class="vk-modal-form" onSubmit={onSubmit}>
        <div class="vk-modal-body vk-modal-fields">
          {fields()}
        </div>
        <div class="vk-modal-foot">
          {cancelButton()}
          {saveButton()}
        </div>
      </form>
    );
  }

  return (
    <form
      class={isBare ? 'vk-profile-edit is-bare' : 'vk-block vk-profile-edit'}
      aria-labelledby={isBare ? undefined : 'vk-profile-edit-title'}
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if(e.key === 'Escape' && !saving()) {
          e.stopPropagation();
          props.onDone();
        }
      }}
    >
      {!isBare && <h2 id="vk-profile-edit-title" class="vk-block-title">Редактирование профиля</h2>}

      <div class="vk-profile-edit-fields">
        {fields()}
      </div>

      <div class="vk-profile-actions">
        {saveButton()}
        {cancelButton()}
      </div>
    </form>
  );
}
