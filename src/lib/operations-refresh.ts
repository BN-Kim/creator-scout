const operationsChangedEvent = "creator-scouting:operations-changed";
const operationsChangedStorageKey = "creator-scouting-operations-changed-at";

export function notifyOperationsChanged(): void {
  window.dispatchEvent(new Event(operationsChangedEvent));
  try {
    window.localStorage.setItem(operationsChangedStorageKey, new Date().toISOString());
  } catch (error: unknown) {
    console.warn("다른 탭에 추천 실행 완료를 알리지 못했습니다.", error);
  }
}

export function subscribeToOperationsChanged(listener: () => void): () => void {
  const handleStorage = (event: StorageEvent): void => {
    if (event.key === operationsChangedStorageKey) listener();
  };
  const handleVisibility = (): void => {
    if (document.visibilityState === "visible") listener();
  };

  window.addEventListener(operationsChangedEvent, listener);
  window.addEventListener("storage", handleStorage);
  window.addEventListener("focus", listener);
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    window.removeEventListener(operationsChangedEvent, listener);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("focus", listener);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}
