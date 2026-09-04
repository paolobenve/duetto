/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { create as createQr } from 'qrcode';

/**
 * A QR code drawn with plain views.
 *
 * The matrix comes from a small pure-JavaScript library; the drawing
 * is one dark square per module, on a white card with the quiet zone a
 * reader expects. No SVG, no image, no native piece: a code of this
 * size is a few hundred squares, which the phone draws without
 * noticing.
 */
export default function QrCode({ text, size }: { text: string; size: number }) {
  const matrix = useMemo(() => {
    try {
      const qr = createQr(text, { errorCorrectionLevel: 'M' });
      const n = qr.modules.size;
      const data = qr.modules.data;
      const rows: boolean[][] = [];
      for (let y = 0; y < n; y++) {
        const row: boolean[] = [];
        for (let x = 0; x < n; x++) row.push(data[y * n + x] === 1);
        rows.push(row);
      }
      return rows;
    } catch {
      return null;
    }
  }, [text]);
  if (!matrix) return null;
  const n = matrix.length;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  return (
    <View style={[styles.card, { width: size, height: size, padding: cell * quiet }]}>
      {matrix.map((row, y) => (
        <View key={y} style={{ flexDirection: 'row', height: cell }}>
          {row.map((dark, x) => (
            <View
              key={x}
              style={{ width: cell, height: cell, backgroundColor: dark ? '#000' : '#fff' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden' },
});
