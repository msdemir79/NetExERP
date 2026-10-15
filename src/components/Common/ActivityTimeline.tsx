import { useState } from 'react';
import { Activity, ArrowRight, CalendarDays, ShoppingCart, Wallet } from 'lucide-react';

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  amount: string;
  kind: 'order' | 'income' | 'expense';
  target: string;
}

export default function ActivityTimeline({ events, onNavigate }: {
  events: TimelineEvent[];
  onNavigate: (path: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const selected = events.find(event => event.id === selectedId) ?? events[0];
  return (
    <section className="activity-workspace" aria-label="Son aktiviteler">
      <div className="min-w-0">
        <div className="flex items-center justify-between mb-5 gap-3">
          <div>
            <p className="text-2xs text-brand font-semibold mb-1">İŞLETMENİN NABZI</p>
            <h2 className="text-lg font-bold text-fg-strong">Aktivite zaman çizelgesi</h2>
          </div>
          <span className="text-2xs text-fg-muted">Son {events.length} hareket</span>
        </div>
        {events.length === 0 ? (
          <div className="p-8 text-center text-fg-muted rounded-2xl border border-dashed border-line">
            <Activity className="w-7 h-7 mx-auto mb-3 text-brand" />
            Henüz aktivite bulunmuyor. Sipariş ve finans hareketleri burada görünecek.
          </div>
        ) : (
          <ol className="activity-timeline">
            {events.map(event => {
              const Icon = event.kind === 'order' ? ShoppingCart : Wallet;
              const active = event.id === selected?.id;
              return (
                <li key={event.id} className="timeline-row" data-active={active}>
                  <time dateTime={event.date} className="text-2xs text-fg-muted pt-4 tabular-nums">
                    {new Date(event.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  </time>
                  <span className={`timeline-icon timeline-${event.kind}`}><Icon className="w-5 h-5" /></span>
                  <button type="button" aria-pressed={active} onClick={() => setSelectedId(event.id)} className="timeline-card text-left min-w-0 cursor-pointer">
                    <span className="flex justify-between items-center gap-2">
                      <span className="font-semibold text-fg-strong truncate">{event.title}</span>
                      <ArrowRight className="w-4 h-4 shrink-0 text-brand" />
                    </span>
                    <span className="block text-xs text-fg-muted truncate mt-1">{event.description}</span>
                    {active && <span className="block mt-3 pt-3 border-t border-line text-sm font-bold text-brand">{event.amount}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <aside className="activity-detail">
        <span className="activity-detail-icon"><Activity className="w-6 h-6" /></span>
        <p className="text-2xs text-fg-muted mt-5 mb-1">HAREKET ÖZETİ</p>
        <h3 className="text-xl font-bold text-fg-strong break-words">{selected?.title ?? 'Aktiviteleriniz burada'}</h3>
        <p className="text-sm text-fg-muted mt-2 break-words">{selected?.description ?? 'Bir hareket oluştuğunda detaylarını bu alandan inceleyebilirsiniz.'}</p>
        {selected && <>
          <div className="my-6 py-5 border-y border-line space-y-4">
            <div className="flex items-center gap-2 text-sm text-fg-muted"><CalendarDays className="w-4 h-4" />{new Date(selected.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            <div><p className="text-xs text-fg-muted mb-1">İşlem tutarı</p><p className="text-2xl font-bold text-fg-strong">{selected.amount}</p></div>
          </div>
          <button type="button" onClick={() => onNavigate(selected.target)} className="flex items-center justify-center gap-2 w-full p-3 rounded-xl bg-brand text-on-brand text-sm font-semibold cursor-pointer hover:bg-brand-hover transition-colors">{selected.kind === 'order' ? 'Siparişlere git' : 'Finans hareketlerine git'}<ArrowRight className="w-4 h-4" /></button>
        </>}
      </aside>
    </section>
  );
}
