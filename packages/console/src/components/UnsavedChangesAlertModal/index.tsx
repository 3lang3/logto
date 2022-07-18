import { assert } from '@silverhand/essentials';
import type { Blocker, Transition } from 'history';
import { useCallback, useContext, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UNSAFE_NavigationContext, Navigator } from 'react-router-dom';

import ConfirmModal from '../ConfirmModal';

type BlockFunction = (blocker: Blocker) => () => void;

type BlockerNavigator = Navigator & {
  location: Location;
  block: BlockFunction;
};

type Props = {
  hasUnsavedChanges: boolean;
};

const UnsavedChangesAlertModal = ({ hasUnsavedChanges }: Props) => {
  const { navigator } = useContext(UNSAFE_NavigationContext);

  const [displayAlert, setDisplayAlert] = useState(false);
  const [transition, setTransition] = useState<Transition>();

  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  useLayoutEffect(() => {
    function validate(navigator: Navigator): asserts navigator is BlockerNavigator {
      assert(
        'block' in navigator && 'location' in navigator,
        new Error(t('errors.invalid_navigator'))
      );
    }

    if (!hasUnsavedChanges) {
      return;
    }

    validate(navigator);

    const {
      block,
      location: { pathname },
    } = navigator;

    const unblock = block((transition) => {
      const {
        location: { pathname: targetPathname },
      } = transition;

      // Note: We don't want to show the alert if the user is navigating to the same page.
      if (targetPathname === pathname) {
        return;
      }

      setDisplayAlert(true);

      setTransition({
        ...transition,
        retry() {
          unblock();
          transition.retry();
        },
      });
    });

    return unblock;
  }, [navigator, hasUnsavedChanges, t]);

  const leavePage = useCallback(() => {
    transition?.retry();
    setDisplayAlert(false);
  }, [transition]);

  const stayOnPage = useCallback(() => {
    setDisplayAlert(false);
  }, [setDisplayAlert]);

  return (
    <ConfirmModal
      isOpen={displayAlert}
      confirmButtonText="general.leave_page"
      cancelButtonText="general.stay_on_page"
      onCancel={stayOnPage}
      onConfirm={leavePage}
    >
      {t('general.unsaved_changes_warning')}
    </ConfirmModal>
  );
};

export default UnsavedChangesAlertModal;
