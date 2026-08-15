---
description: Cerca una parola in tutto ciò che è stato scritto - conversazioni, commit, codice e documentazione
---

Cerca `$ARGUMENTS` in tutti i posti dove resta traccia del lavoro su questo
progetto, e riporta i risultati in italiano, raggruppati per fonte.

Cerca in quest'ordine, e **fermati quando hai abbastanza** per rispondere:

1. **Messaggi dei commit** — è la fonte migliore, perché ogni commit spiega
   perché una cosa è stata fatta:
   `git -C /home/paolo/git/duetto log --grep="$ARGUMENTS" -i --oneline`

2. **Storia del codice** — chi ha introdotto o tolto quella stringa:
   `git -C /home/paolo/git/duetto log -S "$ARGUMENTS" -i --oneline`

3. **Codice e documentazione attuali** — i commenti sono in italiano:
   `grep -rn -i "$ARGUMENTS" /home/paolo/git/duetto/app/src /home/paolo/git/duetto/server/src /home/paolo/git/duetto/docs /home/paolo/git/duetto/README.md /home/paolo/git/duetto/CHANGELOG.md`

4. **Conversazioni passate**, solo se le prime tre non bastano: sono file
   JSON grossi, quindi estrai il contesto attorno alla parola invece di
   stampare righe intere:
   `grep -hoi ".\{250\}$ARGUMENTS.\{350\}" /home/paolo/.claude/projects/-home-paolo-git/*.jsonl | head -5`

Presentando i risultati:

- Metti prima **la risposta**, poi da dove viene. Chi cerca vuole sapere
  cosa è stato deciso, non leggere un elenco di righe.
- Se trovi la spiegazione di *perché* una cosa è stata fatta, riportala:
  è quella che serve, e vive nei messaggi dei commit.
- Se le conversazioni contengono ipotesi poi rivelatesi sbagliate, dillo:
  senza quella distinzione si rischia di ripescare una diagnosi scartata
  credendola una conclusione.
- Se non trovi nulla, dillo in una riga invece di elencare dove hai
  guardato.
