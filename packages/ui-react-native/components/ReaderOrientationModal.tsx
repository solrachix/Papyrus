import React from "react";
import { Modal, type ModalProps } from "react-native";

const READER_MODAL_SUPPORTED_ORIENTATIONS: NonNullable<ModalProps["supportedOrientations"]> = [
  "portrait",
  "portrait-upside-down",
  "landscape-left",
  "landscape-right",
];

type ReaderOrientationModalProps = Omit<ModalProps, "supportedOrientations">;

/** Keeps reader sheets and editors in the device's current orientation on iOS. */
export function ReaderOrientationModal(props: ReaderOrientationModalProps) {
  return (
    <Modal
      {...props}
      supportedOrientations={READER_MODAL_SUPPORTED_ORIENTATIONS}
    />
  );
}
