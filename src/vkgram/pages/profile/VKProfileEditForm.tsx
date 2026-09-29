import {createResource, createSignal, onCleanup, onMount, Show} from 'solid-js';
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
 */
export default function VKProfileEditForm(props: {
  user: User.user,
  userFull?: UserFull.userFull,
  onDone: () => void
}) {
  const managers = rootScope.managers;
  const listenerSetter = new ListenerSetter();
  onCleanup(() => listenerSetter.removeAll());

  const [bioMaxLength] = createResource(() => managers.apiManager.getLimit('bio'));
  const [saving, setSaving] = createSignal(false);
  const [canSave, setCanSave] = createSignal(false);

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
    firstNameField.input.focus();
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

  return (
    <form
      class="vk-block vk-profile-edit"
      aria-labelledby="vk-profile-edit-title"
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if(e.key === 'Escape' && !saving()) {
          e.stopPropagation();
          props.onDone();
        }
      }}
    >
      <h2 id="vk-profile-edit-title" class="vk-block-title">Редактирование профиля</h2>

      <div class="vk-profile-edit-fields">
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
      </div>

      <div class="vk-profile-actions">
        <button type="submit" class="vk-button" disabled={!canSave() || saving()}>
          {saving() ? 'Сохранение…' : 'Сохранить'}
        </button>
        <button type="button" class="vk-button vk-button-secondary" disabled={saving()} onClick={() => props.onDone()}>
          Отмена
        </button>
      </div>
    </form>
  );
}
