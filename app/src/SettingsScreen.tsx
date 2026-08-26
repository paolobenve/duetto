import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, Modal, Pressable,
} from 'react-native';
import type { DuoConfig, PairInfo, VideoQuality } from './config';
import { t } from './i18n';
import {
  isServerConfigured, isPaired, normalizeServerUrl, displayServer, VIDEO_PROFILES,
  pairName,
} from './config';
import { peerAvatar } from './avatar';
import { VERSION_FULL } from './version';
import { Avvisi } from 'duetto-platform';

/**
 * Le scelte per la vibrazione dell'notice.
 *
 * "Predefinito" non è pigrizia: Android sa cose che l'app non sa - se sei
 * in silenzioso, in "non disturbare", con le cuffie - e lasciandogli la
 * decisione l'notice si comporta come tutte le altre notifiche del
 * telefono. Le altre due la forzano, in un senso o nell'altro.
 */
const VIBRAZIONI: {
  valore: DuoConfig['alertVibration']; label: string; nota: string;
}[] = [
  {
    valore: 'default',
    label: 'Come decide il telefono',
    nota: 'Segue le regole di Android: silenzioso, non disturbare, e quello che hai impostato per le notifiche.',
  },
  {
    valore: 'always',
    label: 'Sempre',
    nota: 'Due colpi staccati, diversi da una notifica qualunque.',
  },
  { valore: 'never', label: 'Mai', nota: 'Solo la notifica, muta e ferma.' },
];

const SUONI: {
  valore: DuoConfig['alertSound']; label: string; nota: string;
}[] = [
  {
    valore: 'default',
    label: 'Suono di notifica del telefono',
    nota: 'Quello che senti per i messaggi.',
  },
  { valore: 'none', label: 'Nessuno', nota: 'Silenzioso.' },
  {
    valore: 'chosen',
    label: 'Scegli un suono…',
    nota: 'Fra quelli del telefono. Un suono diverso dagli altri fa capire chi è senza guardare.',
  },
];

/**
 * Quanto si fanno da parte i comandi.
 *
 * Le percentuali non sono un dettaglio da tecnici: sono esattamente la
 * cosa che si sta scegliendo, e chi legge "molto sfumato" senza un
 * numero non sa se sarà un'ombra o un ricordo.
 */
const COMANDI: {
  valore: DuoConfig['controls']; label: string; nota: string;
}[] = [
  {
    valore: 'dim',
    label: 'Poco sfumati',
    nota: 'Restano leggibili, al 40%. È il modo di sempre.',
  },
  {
    valore: 'faint',
    label: 'Molto sfumati',
    nota: 'Un’ombra, al 15%: si intuisce dove sono senza che coprano niente.',
  },
  {
    valore: 'hidden',
    label: 'Nascosti',
    nota: 'Spariscono del tutto, immagine pulita.',
  },
];

type Props = {
  initial: DuoConfig;
  onSave: (cfg: DuoConfig) => void;
  /** dimentica un connectionName, in uso o no */
  onForgetPair: (id: string) => void;
  /** mette in uso un connectionName già configurato */
  onSwitchPair: (id: string) => void;
  /** il nome che do io a un connectionName; vuoto = torna al suo */
  onRenamePair: (id: string, nome: string) => void;
  /**
   * Aggiunge un accoppiamento senza toccare quelli che ci sono: serve
   * per una persona nuova, e serve quando l'altro ha sciolto dalla sua
   * parte e qui non c'è modo di saperlo.
   */
  onRepair: () => void;
  /** torna indietro senza salvare; assente se non c'è dove tornare */
  onClose?: () => void;
  /** riapre la schermata delle impostazioni di systemVolume */
  onOpenSetup: () => void;
  /**
   * VP9 in hardware, sui due telefoni separatamente.
   *
   * L'opzione si mostra sempre, ma è selezionabile solo con entrambi:
   * le preferenze di codec valgono per l'intera sessione, quindi
   * sceglierlo perché lo sa fare uno solo costringerebbe l'altro a
   * encodare via software. Mostrarla in grigio dicendo di chi è il
   * limite è più utile che nasconderla.
   */
  vp9Here?: boolean;
  vp9Peer?: boolean;
  /**
   * La qualità si applica al tocco, senza passare da "Salva".
   *
   * È l'unica impostazione che si giudica guardando: si prova, si vede
   * l'effetto, si cambia. Doverla confermare con un pulsante costringe a
   * uscire dalle impostazioni per accorgersi di come è venuta.
   */
  onQualityChange?: (q: VideoQuality) => void;
  /**
   * Impostazioni che si applicano al tocco e si scrivono subito.
   *
   * Da accoppiati non c'è nessun "Salva" - il server non si tocca - e un
   * interruttore che aspetta una conferma inesistente non si accende mai.
   */
  onLive?: (patch: Partial<DuoConfig>) => void;
};

/**
 * Impostazioni. In primo piano c'è una cosa sola: dove sta il server.
 * Tutto il resto è facoltativo e sta sotto "Altre impostazioni".
 */
export default function SettingsScreen({
  initial, onForgetPair, onSwitchPair, onRenamePair, onSave, onRepair, onClose, onOpenSetup,
  vp9Here, vp9Peer, onQualityChange, onLive,
}: Props) {
  const vp9Available = !!vp9Here && !!vp9Peer;
  const vp9Motivo = vp9Available
    ? 'Stessa immagine con circa un terzo di dati in meno.'
    : !vp9Here && !vp9Peer
      ? 'Nessuno dei due telefoni ha l’encoder VP9 in hardware.'
      : !vp9Here
        ? 'Questo telefono non ha l’encoder VP9 in hardware.'
        : 'L’altro telefono non ha l’encoder VP9 in hardware. Serve su entrambi: ' +
          'il codec è uno solo per tutta la sessione.';
  // Nel campo si mostra il dominio, non l'indirizzo completo che sta in
  // configurazione: è quello che si chiede, ed è quello che si rilegge.
  const [cfg, setCfg] = useState<DuoConfig>(
    () => ({ ...initial, serverUrl: displayServer(initial.serverUrl) }),
  );
  const [advanced, setAdvanced] = useState(false);
  /** il campo del server compare solo su richiesta, se già accoppiati */
  const [cambiaServer, setCambiaServer] = useState(false);
  const set = (k: keyof DuoConfig) => (v: string) => setCfg({ ...cfg, [k]: v });

  const ready = isServerConfigured(cfg);
  const paired = isPaired(cfg);
  const resolved = normalizeServerUrl(cfg.serverUrl);

  /**
   * I collegamenti, quello in uso per primo.
   *
   * Si legge dalla configurazione arrivata, non da quella in
   * lavorazione: qui dentro si modifica solo il campo del server, e
   * l'elenco lo cambiano i pulsanti, che passano dal genitore.
   */
  const collegamenti = initial.pairs;
  const inUso = initial.pair?.id;

  const nomeDi = (p: PairInfo) => pairName(p) || 'Senza nome';

  /** il connectionName a cui si sta dando un nome, e il nome in corso */
  const [battezzo, setBattezzo] = useState<PairInfo | null>(null);
  const [nomeScritto, setNomeScritto] = useState('');
  const apriBattesimo = (p: PairInfo) => {
    setNomeScritto(p.label || '');
    setBattezzo(p);
  };
  const chiudiBattesimo = (salva: boolean) => {
    if (salva && battezzo) onRenamePair(battezzo.id, nomeScritto);
    setBattezzo(null);
  };

  const confermaScioglimento = (p: PairInfo) => {
    const attivo = p.id === inUso;
    const rimasti = collegamenti.filter((q) => q.id !== p.id);
    const dopo = attivo && rimasti.length
      ? `\n\nPasserai a ${nomeDi(rimasti[0])}.`
      : '';
    Alert.alert(
      `Sciogliere il connectionName con ${nomeDi(p)}?`,
      'Per riaverlo dovrete rifare l’accoppiamento con un codice nuovo.\n\n' +
      'Non serve sciogliere anche sull’altro telefono: da lì basta ' +
      '«Aggiungi un connectionName».' + dopo,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Sciogli', style: 'destructive', onPress: () => onForgetPair(p.id) },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          {onClose ? (
            <TouchableOpacity style={styles.back} onPress={onClose}>
              <Text style={styles.backText}>{'\u2039'}</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.title}>Duetto</Text>
        </View>
        <Text style={styles.subtitle}>
          Un canale solo per voi due. Entri e resti: quando entra anche l’altro,
          vi collegate da soli.
        </Text>

        {paired && !cambiaServer ? (
          // Accoppiati, il server non si tocca quasi mai: mostrarlo come
          // campo modificabile invita a un errore che scollegherebbe
          // tutto. Si vede il valore, e si cambia se lo si chiede.
          <View style={styles.field}>
            <Text style={styles.label}>Server</Text>
            <Text style={styles.readonly}>{displayServer(initial.serverUrl)}</Text>
            <TouchableOpacity onPress={() => setCambiaServer(true)}>
              <Text style={styles.linkInline}>Cambia server</Text>
            </TouchableOpacity>
          </View>
        ) : (
        <View style={styles.field}>
          <Text style={styles.label}>Server</Text>
          <TextInput
            style={styles.input}
            value={cfg.serverUrl}
            onChangeText={set('serverUrl')}
            placeholder="iltuoserver.org"
            placeholderTextColor="#4a5462"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.hint}>
            {cfg.serverUrl.trim()
              ? `Mi collegherò a: ${resolved}`
              : 'Basta il nome: al resto dell’indirizzo penso io.'}
          </Text>
        </View>
        )}

        {/* Il passo avanti sta qui, non in fondo: appena sotto a ciò che si
            è appena scritto. Sotto ci sono impostazioni che si applicano da
            sole o che riguardano una pairStat già fatta. */}
        {!paired || cambiaServer ? (
        <TouchableOpacity
          style={[styles.button, !ready && styles.buttonDisabled]}
          disabled={!ready}
          onPress={() => onSave({ ...cfg, serverUrl: resolved })}>
          <Text style={styles.buttonText}>
            {paired ? 'Salva' : 'Avanti'}
          </Text>
        </TouchableOpacity>
        ) : null}

        {paired ? (
          <>
            <Text style={styles.section}>
              {collegamenti.length > 1 ? 'Collegamenti' : 'Coppia'}
            </Text>
            {collegamenti.length > 1 ? (
              <Text style={styles.sectionHint}>
                All’avvio riprende quello in uso, che è l’ultimo che hai
                usato. Toccane un altro per passare a quello: da quel momento
                sei raggiungibile lì, e non più dov’eri.
              </Text>
            ) : null}
            {collegamenti.map((p) => {
              const attivo = p.id === inUso;
              const faccia = peerAvatar(p.id, p.side);
              return (
                <View key={p.id} style={styles.pairRow}>
                  <TouchableOpacity
                    style={[styles.pairBox, attivo && styles.pairBoxInUso]}
                    disabled={attivo}
                    onPress={() => onSwitchPair(p.id)}>
                    <View style={[styles.pairFace, { backgroundColor: faccia.color }]}>
                      <Text style={styles.pairFaceText}>{faccia.symbol}</Text>
                    </View>
                    <View style={styles.pairWho}>
                      <Text style={styles.pairName}>{nomeDi(p)}</Text>
                      {/* Col nome del connectionName in testa, chi ci sta
                          dall'altra parte va detto lo stesso: sono due
                          cose diverse, e il nome se l'è dato lui. */}
                      {p.label && p.peerName && p.peerName !== 'Qualcuno' ? (
                        <Text style={styles.pairMeta}>con {p.peerName}</Text>
                      ) : null}
                      <Text style={styles.pairMeta}>
                        {attivo ? 'In uso · dal ' : 'Dal '}
                        {p.pairedAt ? new Date(p.pairedAt).toLocaleDateString() : '—'}
                      </Text>
                      {/* Il server fa parte dell'identità del connectionName:
                          la stanza sta lì, e passando a un altro ci si
                          sposta anche di server. Chi ne ha uno solo legge
                          sempre la stessa riga e non ci pensa più. */}
                      <Text style={styles.pairMeta}>
                        {displayServer(p.serverUrl || initial.serverUrl) || '—'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pairAway}
                    onPress={() => apriBattesimo(p)}>
                    <Text style={styles.pairNomeText}>{'\u270E'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pairAway}
                    onPress={() => confermaScioglimento(p)}>
                    <Text style={styles.pairAwayText}>{'\u2715'}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <TouchableOpacity style={styles.secondary} onPress={onRepair}>
              <Text style={styles.secondaryText}>Aggiungi un connectionName</Text>
            </TouchableOpacity>
            <Text style={styles.sectionHint}>
              Mostra un codice nuovo, o digita quello dell’altro. Quelli che
              hai restano dove sono: il nuovo si aggiunge e passa in uso.
              Serve per una persona nuova, e serve se l’altro ha sciolto dalla
              sua parte, perché da qui non c’è modo di accorgersene.
            </Text>
          </>
        ) : null}

        <Text style={styles.subsection}>Qualità del video</Text>
        <Text style={styles.sectionHint}>
          Vale per tutti e due i telefoni: cambiandola qui cambia anche
          all’altro, così non vi ritrovate con due impostazioni diverse senza
          sapere quale delle due state guardando. Se non gli va bene, la
          ricambia lui.
        </Text>
        <Text style={styles.sectionHint}>
          La banda dipende da risoluzione, fotogrammi al secondo e tetto di
          bitrate — non dal codec. Meno di tutti e tre significa meno dati e
          meno batteria, da entrambe le parti.
        </Text>
        {(Object.keys(VIDEO_PROFILES) as VideoQuality[]).map((q) => (
          <TouchableOpacity
            key={q}
            style={[styles.choice, cfg.videoQuality === q && styles.choicePicked]}
            onPress={() => {
              setCfg({ ...cfg, videoQuality: q });
              onQualityChange?.(q);
            }}>
            <View style={[styles.radio, cfg.videoQuality === q && styles.radioPicked]} />
            <View style={styles.choiceText}>
              <Text style={styles.choiceLabel}>{t(`quality.${VIDEO_PROFILES[q].key}`)}</Text>
              <Text style={styles.choiceNote}>{t(`quality.${VIDEO_PROFILES[q].key}Note`)}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <Text style={styles.sectionHint}>
          Sono tetti, non obiettivi: se la scena costa poco e la rete regge,
          due profili diversi possono dare lo stesso risultato. Sotto ai
          pulsanti c’è la risoluzione e la banda che stanno passando davvero,
          in entrambe le direzioni.
        </Text>

        <TouchableOpacity
          disabled={!vp9Available}
          style={[
            styles.choice,
            vp9Available && cfg.videoCodec === 'vp9' && styles.choicePicked,
            !vp9Available && styles.choiceOff,
          ]}
          onPress={() => setCfg({
            ...cfg,
            videoCodec: cfg.videoCodec === 'vp9' ? 'auto' : 'vp9',
          })}>
          <View style={[
            styles.radio,
            vp9Available && cfg.videoCodec === 'vp9' && styles.radioPicked,
          ]} />
          <View style={styles.choiceText}>
            <Text style={[styles.choiceLabel, !vp9Available && styles.textOff]}>
              Codifica VP9
            </Text>
            <Text style={[styles.choiceNote, !vp9Available && styles.textOff]}>
              {vp9Motivo}
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.subsection}>Audio</Text>
        <TouchableOpacity
          style={[styles.choice, cfg.richerAudio && styles.choicePicked]}
          onPress={() => {
            const v = !cfg.richerAudio;
            setCfg({ ...cfg, richerAudio: v });
            onLive?.({ richerAudio: v });
          }}>
          <View style={[styles.radio, cfg.richerAudio && styles.radioPicked]} />
          <View style={styles.choiceText}>
            <Text style={styles.choiceLabel}>Voce più ricca</Text>
            <Text style={styles.choiceNote}>
              Raddoppia il tetto dell’audio, da circa 32 a 64 kbit/s: la voce
              smette di suonare telefonica. Costa 4 kB/s in più per direzione.
              Vale per tutti e due i telefoni: quello che senti lo manda
              l’altro.{'\n'}
              Con il video acceso si alza da sé, spenta o accesa che sia: di
              fianco a mezzo megabit di video quei 4 kB/s non si notano, e
              rinunciare alla voce buona per risparmiarli sarebbe un cattivo
              affare. Torna a contare quando il video si spegne.
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.subsection}>Quando l’altro ti avvisa</Text>
        <Text style={styles.sectionHint}>
          Vale per gli avvisi che arrivano a te. Quello che senti l’altro
          quando sei tu a bussare lo decide lui, sul suo telefono.
        </Text>

        <Text style={styles.sectionHint}>Vibrazione</Text>
        {VIBRAZIONI.map((v) => (
          <TouchableOpacity
            key={v.valore}
            style={[styles.choice, cfg.alertVibration === v.valore && styles.choicePicked]}
            onPress={() => {
              setCfg({ ...cfg, alertVibration: v.valore });
              onLive?.({ alertVibration: v.valore });
            }}>
            <View style={[styles.radio, cfg.alertVibration === v.valore && styles.radioPicked]} />
            <View style={styles.choiceText}>
              <Text style={styles.choiceLabel}>{v.label}</Text>
              <Text style={styles.choiceNote}>{v.nota}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionHint}>Suono</Text>
        {SUONI.map((s) => (
          <TouchableOpacity
            key={s.valore}
            style={[styles.choice, cfg.alertSound === s.valore && styles.choicePicked]}
            onPress={async () => {
              if (s.valore !== 'chosen') {
                setCfg({ ...cfg, alertSound: s.valore });
                onLive?.({ alertSound: s.valore });
                return;
              }
              // La scelta la fa una schermata di systemVolume: se si annulla,
              // non si cambia nulla - nemmeno la voce selezionata, che
              // altrimenti direbbe "scelto" senza che si sia scelto.
              const scelto = await Avvisi.scegliSuono(cfg.alertSoundUri).catch(() => null);
              if (!scelto) return;
              const patch = {
                alertSound: 'chosen' as const,
                alertSoundUri: scelto.uri,
                alertSoundName: scelto.nome,
              };
              setCfg({ ...cfg, ...patch });
              onLive?.(patch);
            }}>
            <View style={[styles.radio, cfg.alertSound === s.valore && styles.radioPicked]} />
            <View style={styles.choiceText}>
              <Text style={styles.choiceLabel}>
                {s.valore === 'chosen' && cfg.alertSoundName
                  ? cfg.alertSoundName
                  : s.label}
              </Text>
              <Text style={styles.choiceNote}>{s.nota}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <Text style={styles.subsection}>Schermata</Text>
        <TouchableOpacity
          style={[styles.choice, cfg.showDiagnostics && styles.choicePicked]}
          onPress={() => {
            const v = !cfg.showDiagnostics;
            setCfg({ ...cfg, showDiagnostics: v });
            onLive?.({ showDiagnostics: v });
          }}>
          <View style={[styles.radio, cfg.showDiagnostics && styles.radioPicked]} />
          <View style={styles.choiceText}>
            <Text style={styles.choiceLabel}>Mostra i dettagli tecnici</Text>
            <Text style={styles.choiceNote}>
              Sotto ai pulsanti: risoluzione, fotogrammi, banda e da dove passa
              il connectionName. Servono a capire perché una chiamata va male.
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.subsection}>I comandi mentre guardi</Text>
        <Text style={styles.sectionHint}>
          Dopo qualche secondo si fanno da parte per lasciare l’immagine.
          Comunque scelti restano premibili, e un tocco ovunque li richiama:
          cambia solo quanta immagine lasciano vedere.
        </Text>
        {COMANDI.map((c) => (
          <TouchableOpacity
            key={c.valore}
            style={[styles.choice, cfg.controls === c.valore && styles.choicePicked]}
            onPress={() => {
              setCfg({ ...cfg, controls: c.valore });
              onLive?.({ controls: c.valore });
            }}>
            <View style={[styles.radio, cfg.controls === c.valore && styles.radioPicked]} />
            <View style={styles.choiceText}>
              <Text style={styles.choiceLabel}>{c.label}</Text>
              <Text style={styles.choiceNote}>{c.nota}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.toggle} onPress={() => setAdvanced(!advanced)}>
          <Text style={styles.toggleText}>
            {advanced ? '▾' : '▸'}  Altre impostazioni
          </Text>
        </TouchableOpacity>

        {advanced ? (
          <View style={styles.advanced}>
            <Text style={styles.sectionHint}>
              Nulla di obbligatorio: senza, funziona lo stesso.
            </Text>
            <Field
              label="Il tuo nome"
              value={cfg.displayName}
              onChange={set('displayName')}
              placeholder="Anna"
              hint="Se lo metti, compare nelle notifiche dell’altro."
            />
          </View>
        ) : null}


        <Text style={styles.section}>Restare raggiungibili</Text>
        <Text style={styles.sectionHint}>
          Due impostazioni di systemVolume, senza le quali il telefono chiude Duetto
          e smetti di ricevere gli avvisi. Si perdono reinstallando l’app o
          cambiando telefono.
        </Text>
        <TouchableOpacity style={styles.rowButton} onPress={onOpenSetup}>
          <Text style={styles.rowButtonText}>Rivedi le impostazioni di systemVolume</Text>
          <Text style={styles.rowButtonArrow}>{'\u203A'}</Text>
        </TouchableOpacity>

        <Text style={styles.section}>Sicurezza</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoLine}>
            {'\u{1F512}'}  Audio e video viaggiano <Text style={styles.infoStrong}>cifrati
            end-to-end</Text> direttamente fra i due telefoni.
          </Text>
          <Text style={styles.infoLine}>
            {'\u{1F512}'}  Anche lo scambio iniziale è cifrato: il server inoltra buste
            che non può aprire, quindi non può inserirsi nella conversazione.
          </Text>
          <Text style={styles.infoLine}>
            {'\u{1F511}'}  La chiave è a 256 bit e nasce dall'accoppiamento. Non è una
            password: non è indovinabile per tentativi.
          </Text>
          <Text style={styles.infoLine}>
            {'\u{1F441}'}  Il server sa <Text style={styles.infoStrong}>quando</Text> siete
            collegati, non <Text style={styles.infoStrong}>cosa</Text> vi dite.
          </Text>
        </View>

        {/* I suoni per richiamare vengono da fuori, e chi li ha
            registrati va nominato: uno dei quattro lo chiede la sua
            licenza, gli altri no, ma citare solo quello obbligatorio
            sarebbe una cortesia a metà. */}
        <Text style={styles.subsection}>Da dove vengono i suoni</Text>
        <Text style={styles.sectionHint}>
          I suoni per richiamare l’altro sono registrazioni pubblicate su
          freesound.org.{'\n'}
          Tamburi — waveplaysfx (#556255), CC0{'\n'}
          Batteria — hewnmarrow (#695331), CC0{'\n'}
          Fanfara — robinhood76 (#534017), CC BY-NC 4.0{'\n'}
          Canto del gallo — kyles (#454174), CC0{'\n'}
          La strombazzata invece la genera l’app, non viene da nessuno.
        </Text>

        <Text style={styles.version}>{VERSION_FULL}</Text>
      </ScrollView>

      {/* Il nome da dare a un connectionName: si apre dalla matita. */}
      <Modal
        visible={!!battezzo}
        transparent
        animationType="fade"
        onRequestClose={() => chiudiBattesimo(false)}>
        <Pressable style={styles.sheetBack} onPress={() => chiudiBattesimo(false)}>
          {/* Il tocco dentro al riquadro non deve chiuderlo: si sta
              scrivendo. */}
          <Pressable style={styles.sheet} onPress={() => { /* trattieni */ }}>
            <Text style={styles.sheetTitle}>Nome del connectionName</Text>
            <TextInput
              style={styles.input}
              value={nomeScritto}
              onChangeText={setNomeScritto}
              placeholder="Casa, ufficio, montagna…"
              placeholderTextColor="#5b6472"
              autoFocus
              maxLength={32}
              returnKeyType="done"
              onSubmitEditing={() => chiudiBattesimo(true)}
            />
            <Text style={styles.hint}>
              È il nome del connectionName, non della persona: serve a te per
              sapere in quale dei tuoi collegamenti stai. Compare sulla
              pastiglia in alto e nella notifica. Resta su questo telefono:
              l’altro non lo vede e non lo saprà mai.
            </Text>
            <View style={styles.sheetAzioni}>
              <TouchableOpacity style={styles.sheetAzione} onPress={() => chiudiBattesimo(false)}>
                <Text style={styles.sheetAnnulla}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAzione} onPress={() => chiudiBattesimo(true)}>
                <Text style={styles.sheetOk}>Salva</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  autoCapitalize?: 'none' | 'sentences';
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        placeholderTextColor="#4a5462"
        secureTextEntry={props.secure}
        autoCapitalize={props.autoCapitalize ?? 'sentences'}
        autoCorrect={false}
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b0e14' },
  container: { padding: 20, paddingTop: 40, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: {
    width: 40, height: 40, borderRadius: 20, marginLeft: -8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#151a23',
  },
  backText: { color: '#c9d2de', fontSize: 26, lineHeight: 30, marginTop: -4 },
  title: { fontSize: 34, fontWeight: '800', color: '#fff' },
  subtitle: { color: '#8892a0', marginTop: 8, marginBottom: 28, lineHeight: 21 },
  section: { color: '#7cc4ff', fontWeight: '700', fontSize: 16, marginTop: 24 },
  subsection: { color: '#c9d2de', fontWeight: '700', fontSize: 15, marginTop: 18 },
  secondary: {
    marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#2f7cf6',
  },
  secondaryText: { color: '#2f7cf6', fontSize: 16, fontWeight: '700' },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#151a23', borderRadius: 12, padding: 14, marginTop: 8,
    borderWidth: 1, borderColor: '#252c38',
  },
  choicePicked: { borderColor: '#2f7cf6', backgroundColor: '#16203050' },
  choiceOff: { opacity: 0.45 },
  textOff: { color: '#6b7480' },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#3a4351',
  },
  radioPicked: { borderColor: '#2f7cf6', borderWidth: 6 },
  choiceText: { flex: 1 },
  choiceLabel: { color: '#e6ebf1', fontSize: 16, fontWeight: '700' },
  choiceNote: { color: '#7d8794', fontSize: 13, marginTop: 3 },
  sectionHint: { color: '#6b7686', fontSize: 13, marginTop: 4, marginBottom: 12, lineHeight: 19 },
  field: { marginBottom: 16 },
  label: { color: '#c9d2de', marginBottom: 6, fontWeight: '600' },
  readonly: { color: '#e6ebf1', fontSize: 16, paddingVertical: 4 },
  linkInline: { color: '#2f7cf6', fontSize: 14, fontWeight: '600', marginTop: 8 },
  input: {
    backgroundColor: '#151a23', color: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 16,
    borderWidth: 1, borderColor: '#252c38',
  },
  hint: { color: '#6b7686', fontSize: 12, marginTop: 6, lineHeight: 17 },
  pairRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 10 },
  pairBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#151a23', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#252c38',
  },
  /** quello in uso si riconosce senza leggere: è l'unico col bordo acceso */
  pairBoxInUso: { borderColor: '#2f7cf6', backgroundColor: '#16203050' },
  pairFace: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  pairFaceText: { fontSize: 20 },
  pairWho: { flex: 1 },
  pairAway: {
    width: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#252c38',
  },
  pairAwayText: { color: '#e5484d', fontSize: 17, fontWeight: '700' },
  pairNomeText: { color: '#7cc4ff', fontSize: 19, fontWeight: '700' },
  sheetBack: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  sheet: {
    width: '100%', maxWidth: 420, backgroundColor: '#151a23', borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: '#252c38',
  },
  sheetTitle: { color: '#e6ebf1', fontSize: 18, fontWeight: '700', marginBottom: 14 },
  sheetAzioni: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  sheetAzione: { paddingVertical: 10, paddingHorizontal: 16 },
  sheetAnnulla: { color: '#8892a0', fontSize: 16, fontWeight: '600' },
  sheetOk: { color: '#2f7cf6', fontSize: 16, fontWeight: '700' },
  pairName: { color: '#e6ebf1', fontSize: 17, fontWeight: '700' },
  pairMeta: { color: '#6b7686', fontSize: 13, marginTop: 4 },
  rowButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#151a23', borderRadius: 12, paddingVertical: 15,
    paddingHorizontal: 16, borderWidth: 1, borderColor: '#252c38',
  },
  rowButtonText: { color: '#e6ebf1', fontSize: 16, fontWeight: '600' },
  rowButtonArrow: { color: '#6b7686', fontSize: 22, lineHeight: 24 },
  toggle: { marginTop: 20, paddingVertical: 10 },
  toggleText: { color: '#7cc4ff', fontSize: 15, fontWeight: '600' },
  advanced: { borderLeftWidth: 2, borderLeftColor: '#252c38', paddingLeft: 14 },
  button: {
    backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 30,
  },
  buttonDisabled: { backgroundColor: '#333c4a' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  version: { color: '#3a4353', fontSize: 12, textAlign: 'center', marginTop: 24 },
  infoBox: {
    backgroundColor: '#151a23', borderRadius: 12, padding: 16, marginTop: 10,
    borderWidth: 1, borderColor: '#252c38', gap: 12,
  },
  infoLine: { color: '#8892a0', fontSize: 13.5, lineHeight: 20 },
  infoStrong: { color: '#c9d2de', fontWeight: '700' },
});
