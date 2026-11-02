export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'small' : ''}`}>
      <span className="brand-mark">
        <i />
        <i />
        <i />
        <i />
      </span>
      {!small && (
        <span>
          interview
          <br />
          <strong>ops desk</strong>
          <span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
