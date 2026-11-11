/**
 * Lets the user pick files to attach: gallery, camera or any document.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { effectiveMimeType } from '@/domain/attachments';
import type { PickedAttachment } from '@/services/mail-service';

function fromImagePicker(result: ImagePicker.ImagePickerResult): PickedAttachment[] {
  if (result.canceled) return [];
  return result.assets.map((asset, index) => {
    const extension = asset.uri.split('.').pop() ?? 'jpg';
    const filename = asset.fileName ?? `photo-${Date.now()}-${index}.${extension}`;
    return {
      uri: asset.uri,
      filename,
      mimeType: effectiveMimeType(asset.mimeType ?? '', filename),
      sizeBytes: asset.fileSize ?? 0,
    };
  });
}

async function pickFromGallery(): Promise<PickedAttachment[]> {
  return fromImagePicker(
    await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 1,
    }),
  );
}

async function pickFromCamera(): Promise<PickedAttachment[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Appareil photo', 'Autorisez l’accès à l’appareil photo dans les réglages.');
    return [];
  }
  return fromImagePicker(await ImagePicker.launchCameraAsync({ quality: 0.85 }));
}

async function pickDocuments(): Promise<PickedAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    filename: asset.name,
    mimeType: effectiveMimeType(asset.mimeType ?? '', asset.name),
    sizeBytes: asset.size ?? 0,
  }));
}

/** Asks where to pick from, then returns the chosen files (empty when cancelled). */
export function pickAttachments(): Promise<PickedAttachment[]> {
  return new Promise((resolve) => {
    const run = (picker: () => Promise<PickedAttachment[]>) => () => {
      picker()
        .then(resolve)
        .catch(() => resolve([]));
    };
    Alert.alert(
      'Joindre',
      undefined,
      [
        { text: 'Fichier', onPress: run(pickDocuments) },
        { text: 'Appareil photo', onPress: run(pickFromCamera) },
        { text: 'Photos et vidéos', onPress: run(pickFromGallery) },
      ],
      { cancelable: true, onDismiss: () => resolve([]) },
    );
  });
}
