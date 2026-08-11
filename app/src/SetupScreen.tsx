import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Foreground } from 'duotalk-platform';

type Props = {
  onDone: () => void;
};

/**
 * Le due impostazioni da cui dipende il restare raggiungibili.
 *
 * Vengono proposte una volta sola, subito dopo l'accoppiamento, perche'
 * senza di esse il telefono chiude l'app quando gli pare e le notifiche
 * non arrivano piu' - un guasto che sembra dell'app ma non lo e'.
 *
 * Nessuna delle due si puo' concedere da codice: la prima ha una finestra
 * di sistema, la seconda e' una schermata dei produttori che possiamo
 * solo aprire.
 */
export default function SetupScreen({ onDone }: Props) {
  const [batteryOk, setBatteryOk] = useState(false);
  const [hasAutoStart, setHasAutoStart] = useState(false);
  const [autoStartOpened, setAutoStartOpened] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setBatteryOk(await Foreground.isBatteryUnrestricted());
      setHasAutoStart(await Foreground.hasAutoStartScreen());
    } catch { /* noop */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.big}>{'\u{1F50B}'}</Text>
      <Text style={styles.title}>Due cose, e poi non ci pensi più</Text>
      <Text style={styles.body}>
        Senza queste, il telefono chiude DuoTalk quando gli pare e smetti di
        ricevere gli avvisi. Sembra un difetto dell’app, ma è il sistema.
      </Text>

      <Step
        n="1"
        title="Uso senza restrizioni"
        text="Permette a DuoTalk di restare attiva anche a schermo spento."
        done={batteryOk}
        action="Consenti"
        onPress={async () => {
          await Foreground.requestBatteryUnrestricted();
          // La finestra e' di sistema: al ritorno ricontrolliamo.
          setTimeout(refresh, 1200);
        }}
      />

      {hasAutoStart ? (
        <Step
          n="2"
          title="Avvio automatico"
          text={
            'Il tuo telefono blocca le app dopo un riavvio finché non le autorizzi. ' +
            'Si apre la schermata di sistema: cerca DuoTalk e attivalo.'
          }
          done={autoStartOpened}
          action={autoStartOpened ? 'Riapri' : 'Apri impostazioni'}
          onPress={async () => {
            const ok = await Foreground.openAutoStartSettings();
            if (!ok) await Foreground.openAppSettings();
            setAutoStartOpened(true);
          }}
        />
      ) : null}

      <Text style={styles.hint}>
        {hasAutoStart
          ? 'L’avvio automatico non è verificabile dall’app: è una schermata del produttore, e nessuna app può leggerne lo stato.'
          : 'Il tuo telefono non ha una schermata di avvio automatico: il primo punto basta.'}
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
