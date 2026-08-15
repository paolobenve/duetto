import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, AppState,
} from 'react-native';
import { Foreground } from 'duetto-platform';

type Props = {
  onDone: () => void;
};

/**
 * Le due impostazioni da cui dipende il restare raggiungibili.
 *
 * Vengono proposte una volta sola, subito dopo l'accoppiamento, perché
 * senza di esse il telefono chiude l'app quando gli pare e le notifiche
 * non arrivano più - un guasto che sembra dell'app ma non lo è.
 *
 * Nessuna delle due si può concedere da codice: la prima ha una finestra
 * di sistema, la seconda è una schermata dei produttori che possiamo
 * solo aprire.
 */
export default function SetupScreen({ onDone }: Props) {
  const [batteryOk, setBatteryOk] = useState(false);
  const [hasAutoStart, setHasAutoStart] = useState(false);
  const [autoStartOpened, setAutoStartOpened] = useState(false);
  /**
   * Se l'app è ripartita da sola dopo l'ULTIMO riavvio del telefono.
   *
   * L'autorizzazione all'avvio automatico non è leggibile da nessuna app
   * - è una schermata del produttore - e prima la spunta si accendeva
   * solo perché avevi aperto quella schermata, anche senza toccare
   * niente. Diceva "a posto" senza saperlo.
   *
   * Questo invece è il fatto: al riavvio il sistema ci ha svegliati
   * oppure no.
   */
  const [avviatoDaSolo, setAvviatoDaSolo] = useState<boolean | null>(null);
  /** la richiesta diretta è stata tentata ma non ha cambiato nulla */
  const [batteryRefused, setBatteryRefused] = useState(false);
  const tried = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const ok = await Foreground.isBatteryUnrestricted();
      setBatteryOk(ok);
      // Se avevamo già provato e nulla è cambiato, la richiesta
      // diretta non è praticabile su questo telefono: si passa alla
      // strada manuale invece di riproporre una finestra che sparisce.
      if (tried.current && !ok) setBatteryRefused(true);
      setHasAutoStart(await Foreground.hasAutoStartScreen());

      // Confronto con l'accensione del telefono: un avvio automatico di
      // tre riavvii fa non dice niente su come è configurato adesso.
      const ultimo = await Foreground.lastAutoStart();
      const acceso = await Foreground.uptimeMs();
      const accensione = Date.now() - acceso;
      setAvviatoDaSolo(ultimo > 0 ? ultimo >= accensione - 60_000 : false);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Al ritorno da una schermata di sistema, ricontrolliamo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.big}>{'\u{1F50B}'}</Text>
      <Text style={styles.title}>Due cose, e poi non ci pensi più</Text>
      <Text style={styles.body}>
        Senza queste, il telefono chiude Duetto quando gli pare e smetti di
        ricevere gli avvisi. Sembra un difetto dell’app, ma è il sistema.
      </Text>

      <Step
        n="1"
        title="Uso senza restrizioni"
        text={
          batteryRefused
            ? 'Il tuo telefono non permette di chiederlo direttamente. Apri la scheda ' +
              'dell’app e cerca «Batteria» o «Risparmio energetico»: scegli ' +
              '«Nessuna restrizione».'
            : 'Permette a Duetto di restare attiva anche a schermo spento.'
        }
        done={batteryOk}
        action={batteryRefused ? 'Apri la scheda dell’app' : 'Consenti'}
        onPress={async () => {
          if (batteryRefused) {
            await Foreground.openAppSettings();
            return;
          }
          tried.current = true;
          await Foreground.requestBatteryUnrestricted();
          setTimeout(refresh, 1500);
        }}
      />

      {hasAutoStart ? (
        <Step
          n="2"
          title="Avvio automatico"
          text={
            avviatoDaSolo
              ? 'Funziona: dopo l’ultimo riavvio del telefono Duetto è ripartita da ' +
                'sola, senza che tu la aprissi.'
              : 'Il tuo telefono blocca le app dopo un riavvio finché non le autorizzi. ' +
                'Si apre la schermata di sistema: cerca Duetto e attivalo.\n\n' +
                'Se l’hai già fatto, si saprà al prossimo riavvio: è l’unico modo di ' +
                'verificarlo, perché quell’autorizzazione nessuna app può leggerla.'
          }
          done={!!avviatoDaSolo}
          action={autoStartOpened ? 'Riapri' : 'Apri impostazioni'}
          onPress={async () => {
            const ok = await Foreground.openAutoStartSettings();
            if (!ok) await Foreground.openAppSettings();
            setAutoStartOpened(true);
          }}
        />
      ) : null}

      <Text style={styles.hint}>
        Su alcuni telefoni (Xiaomi, Huawei, Oppo) il risparmio energetico è
        gestito dal produttore e non da Android: la spunta qui sopra può
        restare grigia anche dopo averlo impostato. Se l’hai fatto, prosegui.
      </Text>

      <Text style={styles.hint}>
        {!hasAutoStart
          ? 'Il tuo telefono non ha una schermata di avvio automatico: il primo punto basta.'
          : avviatoDaSolo
            ? 'La spunta qui sopra non è un’ipotesi: è successo davvero, dopo l’ultimo riavvio.'
            : 'Lo stato di quell’autorizzazione nessuna app può leggerlo. Quello che si può ' +
              'sapere è se ha funzionato, e lo si scopre al primo riavvio del telefono.'}
      </Text>

      <TouchableOpacity style={styles.button} onPress={onDone}>
        <Text style={styles.buttonText}>Ho fatto, prosegui</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.link} onPress={onDone}>
        <Text style={styles.linkText}>Salta per ora</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Step(props: {
  n: string;
  title: string;
  text: string;
  done: boolean;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <View style={[styles.badge, props.done && styles.badgeDone]}>
          <Text style={styles.badgeText}>{props.done ? '✓' : props.n}</Text>
        </View>
        <Text style={styles.stepTitle}>{props.title}</Text>
      </View>
      <Text style={styles.stepText}>{props.text}</Text>
      <TouchableOpacity
        style={[styles.stepButton, props.done && styles.stepButtonDone]}
        onPress={props.onPress}>
        <Text style={[styles.stepButtonText, props.done && styles.stepButtonTextDone]}>
          {props.done ? 'Già a posto' : props.action}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b0e14' },
  container: { padding: 24, paddingTop: 64, paddingBottom: 40 },
  big: { fontSize: 46, textAlign: 'center' },
  title: {
    color: '#fff', fontSize: 24, fontWeight: '800',
    textAlign: 'center', marginTop: 14,
  },
  body: {
    color: '#8892a0', fontSize: 15, textAlign: 'center',
    marginTop: 12, marginBottom: 26, lineHeight: 22,
  },
  step: {
    backgroundColor: '#151a23', borderRadius: 14, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#252c38',
  },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#2a313d',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeDone: { backgroundColor: '#2a7d46' },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepTitle: { color: '#e6ebf1', fontSize: 17, fontWeight: '700' },
  stepText: { color: '#8892a0', fontSize: 14, marginTop: 10, lineHeight: 20 },
  stepButton: {
    marginTop: 14, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
    backgroundColor: '#2f7cf6',
  },
  stepButtonDone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2a7d46' },
  stepButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  stepButtonTextDone: { color: '#4fb573' },
  hint: { color: '#5a6472', fontSize: 12.5, lineHeight: 18, marginTop: 4, marginBottom: 10 },
  button: {
    backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 16,
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  link: { marginTop: 14, padding: 10, alignItems: 'center' },
  linkText: { color: '#6b7686', fontSize: 15 },
});
