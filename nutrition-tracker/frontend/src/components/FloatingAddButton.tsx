export function FloatingAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Add log"
      className="bg-primary-500 hover:bg-primary-600 fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full text-3xl font-light text-white shadow-lg transition-colors"
      style={{ maxWidth: 'calc(480px - 40px)' }}
    >
      +
    </button>
  );
}
