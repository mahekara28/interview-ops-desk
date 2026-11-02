import { ChevronRight, Plug } from 'lucide-react';

export function EmptyLive({
  configured,
  onConnect,
}: {
  configured: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="empty-live">
      <Plug size={38} />
      <h2>{configured ? 'Ready to read your interview feed.' : 'Connect your source of truth.'}</h2>
      <p>
        {configured
          ? 'Run a read-only sync to inspect upcoming timed interviews. Configured credentials are not proof of a successful connection.'
          : 'Demo records stay in their own workspace. Add authorized Greenhouse credentials to bring live interviews here.'}
      </p>
      <button className="button primary" onClick={onConnect}>
        Connection details
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
