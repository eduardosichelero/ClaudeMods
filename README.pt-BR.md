# Claude Mods

<p align="center"><a href="README.md">English</a> · <b>Português</b></p>

Uma barra lateral para o [Claude Code](https://claude.com/claude-code): modo Zen, temas, modelo e esforço, e uma linha de status.

Um fork do [ClaudeMods do Jhonatan de Souza](https://github.com/Jhonatan-de-Souza/ClaudeMods) que adiciona a aba Aprender e desenha a barra lateral nas cores do próprio app desktop.

### Zen

Esconde todas as chamadas de ferramentas e os blocos gigantes de código, e mostra só uma barra de progresso e pequenos relatos do andamento.

<img src="docs/screenshots/zen-demo.gif" alt="Modo Zen com a faixa verde: o Claude manda atualizações curtas enquanto a barra enche passo a passo" width="720">

<img src="docs/screenshots/zen.png" alt="Aba Zen" width="360">

### Tema

Aplica qualquer um dos mais de 100 temas do [terminalcolors.com](https://terminalcolors.com) com um clique.

<img src="docs/screenshots/theme-demo.gif" alt="Trocando de tema na aba Tema: a sessão inteira muda de cor na hora" width="720">

### Modo

Troca o modelo e o esforço, e escolhe o modo em que as novas sessões começam.

<img src="docs/screenshots/mode-demo.png" alt="Modelo trocado para Sonnet e esforço para high pela aba Modo, no meio da sessão" width="720">

<img src="docs/screenshots/mode.png" alt="Aba Modo" width="360">

### Status

Mostra modelo, pasta, branch, contexto, limites de 5h/7d e estado do cache numa linha só.

<img src="docs/screenshots/status-demo.png" alt="A linha de status abaixo do prompt, com um shell rodando em segundo plano" width="720">

<img src="docs/screenshots/status.png" alt="Aba Status" width="360">

### Aprender

O Claude explica, enquanto trabalha, as tecnologias e os passos que escolhe: o que cada um é, para que serve ali e por que foi escolhido. Cada explicação é um cartão na cor do seu tipo, com o porquê numa linha própria, sob o começo do pedido em que foi feita. Ligue na aba Aprender; o painel passa a abrir ao lado do trabalho com 40% do terminal, e o Esc devolve o teclado sem fechá-lo. `/tools learn` abre direto nela.

A barra lateral fala English e Português. Teclas: **Tab** move, **Enter** escolhe, **Esc** fecha.

## Instalação

Precisa do Claude Code 2.1.292 ou mais novo.

```
claude plugin marketplace add eduardosichelero/ClaudeMods
claude plugin install extra-mods@jdsjh-mods --scope user
```

No app desktop do Claude: clique em **+** ao lado da caixa do prompt e depois em **Plugins**, adicione o marketplace `eduardosichelero/ClaudeMods` e, por fim, o plugin `extra-mods`.

Rode `/reload-plugins` (ou abra uma nova sessão) e clique em **◆ extra-mods ▲** no canto inferior direito, ou digite `/tools`.

Para atualizar: `claude plugin marketplace update jdsjh-mods && claude plugin update extra-mods@jdsjh-mods`

<details>
<summary><b>Bom saber</b></summary>

- **Zen:** o Claude ganha uma ferramenta `zen_progress` para postar o plano e atualizar cada etapa. `[–]` encolhe a faixa para uma linha. Cores da faixa: blue, dark, light, green, rainbow ou custom.
- **Tema:** os temas são baixados uma vez para `~/.claude/extra-mods/themes/`. O escolhido vira `~/.claude/themes/extra-mods.json` e fica salvo no `~/.claude/settings.json`. Reinicie o Claude Code uma vez na primeira vez; depois disso os temas trocam ao vivo. O fundo do terminal acompanha, no Windows Terminal (durante a sessão, depois volta ao normal) e nos terminais que aceitam cores OSC (Ghostty, iTerm2, kitty, WezTerm, Terminal.app).
- **Modo:** a troca de modelo usa o `/model` do próprio Claude Code. O esforço vale para todas as requisições e fica salvo. O modo de permissão da sessão atual muda com **shift+tab**; a escolha aqui é salva como `permissions.defaultMode`.
- **Status:** vem ligado. Tira o seu `statusLine` do `settings.json` e coloca de volta quando você desliga. Shells e monitores em segundo plano aparecem numa segunda linha; clique para abrir `/tasks`.
- **Aprender:** ligado, uma seção curta entra no prompt de sistema do Claude e a ferramenta `explain` entra na lista de ferramentas; desligado, as duas saem. Para gastar pouco, o Claude manda as explicações de um passo numa chamada só, junto do trabalho que explicam, com uma ou duas frases cada, e só na primeira vez que algo aparece: uma cujo título já foi mostrado fica de fora, e o Claude é avisado. Subagentes não postam no painel. Uma sessão aceita até 10 explicações, contadas na aba; depois disso o Claude é avisado para seguir sem elas, e um `/clear` zera a contagem. Elas vêm no idioma do painel.
- Todo arquivo de configuração ganha um backup antes, como `*.extra-mods.bak`.

</details>

<details>
<summary><b>Instalar com um agente de IA</b></summary>

Aponte seu agente para este repositório e peça para instalar o mod. Passos para o agente (pergunte ao usuário antes do passo 4):

1. Rode `claude --version`; precisa ser 2.1.292 ou maior.
2. Rode `claude plugin marketplace add eduardosichelero/ClaudeMods`.
3. Rode `claude plugin install extra-mods@jdsjh-mods --scope user`.
4. *Opcional, só se o usuário não quiser a linha de status do mod:* copie `statusline/statusline.py` para `~/.claude/statusline.py` e defina `"statusLine": { "type": "command", "command": "python ~/.claude/statusline.py", "refreshInterval": 2 }` no `~/.claude/settings.json` (`python3` no macOS e Linux).
5. Confira se `claude plugin list` mostra o `extra-mods` ativado e peça ao usuário para rodar `/reload-plugins`.

No Windows, use barras normais nos caminhos ao rodar no Git Bash.

</details>

## Desenvolver

```
claude --plugin-dir ./plugins/extra-mods
claude plugin validate ./plugins/extra-mods
claude plugin test ./plugins/extra-mods
```
