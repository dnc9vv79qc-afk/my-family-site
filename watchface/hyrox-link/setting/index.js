// Zepp アプリの「HYROX Link」設定画面: サーバーの URL・合言葉・地図の描画量
AppSettingsPage({
  build(props) {
    const s = props.settingsStorage
    const field = (label, key, placeholder) =>
      View({ style: { marginTop: '16px' } }, [
        Text({ bold: true }, [label]),
        TextInput({
          label: placeholder,
          value: s.getItem(key) || '',
          onChange: (v) => s.setItem(key, String(v).trim()),
        }),
      ])
    const detail = s.getItem('detail') || '2'
    return Section({ style: { padding: '16px' } }, [
      Text({ paragraph: true }, ['watch-server の設定。合言葉はリポジトリに書かず、ここにだけ入れる。']),
      field('サーバー URL', 'server', 'https://my-family-site-six.vercel.app'),
      field('合言葉（WATCH_KEY）', 'key', 'WATCH_KEY'),
      View({ style: { marginTop: '16px' } }, [
        Text({ bold: true }, [`地図の描画量: ${detail}（1: 大通り / 2: 標準 / 3: 細い道まで）`]),
        View({ style: { display: 'flex', flexDirection: 'row', marginTop: '8px' } }, [
          Button({ label: '1', onClick: () => s.setItem('detail', '1') }),
          Button({ label: '2', onClick: () => s.setItem('detail', '2') }),
          Button({ label: '3', onClick: () => s.setItem('detail', '3') }),
        ]),
      ]),
    ])
  },
})
