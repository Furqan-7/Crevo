import styles from "../_shell/states.module.css";

// Shown inside the shell while a workspace screen loads: a top bar, a title
// and three cards in the shape of the real screens.
function Bar({ w, h = 12, r }: { w: number | string; h?: number; r?: number }) {
  return <span className={styles.skel} style={{ width: w, height: h, borderRadius: r }} />;
}

export default function Loading() {
  return (
    <div aria-busy="true">
      <span className={styles.srOnly} role="status">Loading…</span>
      <div className={styles.skelTop}>
        <Bar w="min(560px, 70%)" h={44} r={10} />
        <span style={{ marginLeft: "auto" }} />
        <Bar w={44} h={44} r={10} />
        <Bar w={150} h={44} r={4} />
      </div>
      <div className={styles.skelHead}>
        <Bar w={80} h={14} />
        <Bar w="min(420px, 80%)" h={44} />
        <Bar w="min(560px, 90%)" h={16} />
      </div>
      <div className={styles.skelGrid}>
        {[5, 4, 3].map((rows, i) => (
          <div key={i} className={styles.skelCard}>
            <div className={styles.skelRow}>
              <Bar w={26} h={26} />
              <Bar w="45%" h={14} />
            </div>
            {Array.from({ length: rows }, (_, j) => (
              <div key={j} className={styles.skelRow}>
                <Bar w={34} h={34} r={17} />
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Bar w={`${80 - j * 7}%`} h={12} />
                  <Bar w={`${55 - j * 5}%`} h={10} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
