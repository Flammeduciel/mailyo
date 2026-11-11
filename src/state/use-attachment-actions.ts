/**
 * Download / save / share flows for attachments, shared by the conversation
 * screen and the files screen. Asks before big downloads on mobile data.
 */

import * as Network from 'expo-network';
import { useCallback, useState } from 'react';
import { Alert, ToastAndroid, Platform } from 'react-native';

import { formatFileSize } from '@/domain/attachments';
import type { Attachment } from '@/domain/models';
import { ensureLocalFile, saveFileToDevice, shareFile } from '@/services/attachment-files';
import { useApp } from '@/state/app-context';

function toast(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}

function confirm(title: string, message: string, action: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
      { text: action, onPress: () => resolve(true) },
    ]);
  });
}

export interface AttachmentProgress {
  id: string;
  /** 0..1 when known, null while indeterminate. */
  ratio: number | null;
}

export function useAttachmentActions() {
  const { service } = useApp();
  const [progress, setProgress] = useState<AttachmentProgress | null>(null);

  /** Asks before a large download on mobile data; true when it may proceed. */
  const allowDownload = useCallback(
    async (attachment: Attachment): Promise<boolean> => {
      if (attachment.localPath && !/^https?:/i.test(attachment.localPath)) {
        return true;
      }
      const limitMb = service.getSettings().cellularConfirmMb;
      if (limitMb <= 0 || attachment.sizeBytes <= limitMb * 1024 * 1024) {
        return true;
      }
      try {
        const state = await Network.getNetworkStateAsync();
        if (state.type !== Network.NetworkStateType.CELLULAR) {
          return true;
        }
      } catch {
        return true;
      }
      return confirm(
        'Données mobiles',
        `« ${attachment.filename} » fait ${formatFileSize(attachment.sizeBytes)}. Le télécharger quand même ?`,
        'Télécharger',
      );
    },
    [service],
  );

  /** Downloads when needed and returns the attachment with a local copy. */
  const resolve = useCallback(
    (attachmentId: string) => service.resolveAttachment(attachmentId),
    [service],
  );

  const localFile = useCallback(
    async (attachment: Attachment): Promise<string | null> => {
      if (!(await allowDownload(attachment))) {
        return null;
      }
      setProgress({ id: attachment.id, ratio: null });
      try {
        const resolved = await service.resolveAttachment(attachment.id);
        return await ensureLocalFile(resolved, (ratio) =>
          setProgress({ id: attachment.id, ratio }),
        );
      } finally {
        setProgress(null);
      }
    },
    [allowDownload, service],
  );

  const save = useCallback(
    async (attachment: Attachment) => {
      try {
        const file = await localFile(attachment);
        if (file && (await saveFileToDevice(attachment, file)) && Platform.OS === 'android') {
          toast('Fichier enregistré');
        }
      } catch (cause) {
        Alert.alert(
          'Téléchargement impossible',
          cause instanceof Error ? cause.message : String(cause),
        );
      }
    },
    [localFile],
  );

  const share = useCallback(
    async (attachment: Attachment) => {
      try {
        const file = await localFile(attachment);
        if (file) await shareFile(attachment, file);
      } catch (cause) {
        Alert.alert('Partage impossible', cause instanceof Error ? cause.message : String(cause));
      }
    },
    [localFile],
  );

  return { progress, resolve, allowDownload, save, share };
}
