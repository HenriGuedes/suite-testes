/**
 * Informa ao NetSuite qual versão da API será utilizada.
 * Define o tipo do script.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

define(["N/ui/serverWidget", "N/search"], (serverWidget, search) => {
  function onRequest(context) {
    // Cria o formulário principal do Suitelet
    var form = serverWidget.createForm({
      title: "Giro de Estoque",
    });

    /*
      Campo onde o usuário seleciona o produto.

      Usamos "source: item" para que o NetSuite mostre o seletor
      NATIVO dele (o mesmo campo de produto que aparece em Pedidos
      de Venda, por exemplo). Esse seletor já vem pronto com:
        - Busca por nome (basta digitar parte do nome do produto)
        - Sem limite de 1000 itens, porque ele não carrega a lista
          inteira de uma vez, ele busca conforme você digita.
    */
    var campoProduto = form.addField({
      id: "custpage_produto",
      type: serverWidget.FieldType.SELECT,
      label: "Produto",
      source: "item",
    });

    // Campo para escolher o período de análise
    var campoPeriodo = form.addField({
      id: "custpage_periodo",
      type: serverWidget.FieldType.SELECT,
      label: "Período",
    });

    // Recupera o período escolhido após clicar em pesquisar
    var periodoEscolhido = context.request.parameters.custpage_periodo;

    // Mantém o período selecionado pelo usuário após pesquisar
    campoPeriodo.addSelectOption({
      value: "30",
      text: "Últimos 30 dias",
      isSelected: periodoEscolhido == "30",
    });

    campoPeriodo.addSelectOption({
      value: "90",
      text: "Últimos 3 meses",
      isSelected: periodoEscolhido == "90",
    });

    campoPeriodo.addSelectOption({
      value: "180",
      text: "Últimos 6 meses",
      isSelected: periodoEscolhido == "180",
    });

    campoPeriodo.addSelectOption({
      value: "365",
      text: "Últimos 12 meses",
      isSelected: periodoEscolhido == "365",
    });

    // Campo que mostra o resultado do giro
    var campoGiro = form.addField({
      id: "custpage_giro",
      type: serverWidget.FieldType.TEXT,
      label: "Giro de Estoque",
    });

    /*
      IMPORTANTE: o método getRange() do NetSuite tem um limite fixo
      de 1000 resultados por chamada — isso é uma regra da própria
      plataforma, não dá pra "aumentar" o número.

      Por isso, sempre que existir a chance de ter mais de 1000
      registros (lotes, movimentações), usamos runPaged(), que
      percorre TODAS as páginas de resultado automaticamente,
      sem esse limite.
    */

    // Produto escolhido pelo usuário
    var produtoEscolhido = context.request.parameters.custpage_produto;

    // Mantém o produto selecionado após pesquisar
    if (produtoEscolhido) {
      campoProduto.defaultValue = produtoEscolhido;
    }

    if (context.request.method == "POST") {
      // Guarda o estoque atual somando todos os lotes
      var estoqueAtual = 0;

      /*
        MELHORIA DE PERFORMANCE:
        Antes, o código buscava a quantidade de CADA lote com uma
        busca separada dentro do loop. Com milhares de lotes, isso
        gera milhares de buscas e o NetSuite bloqueia o script por
        estourar a cota de uso (governance limit).

        Agora fazemos UMA ÚNICA busca agrupada por lote (GROUP/SUM),
        trazendo a quantidade de todos os lotes de uma vez só.
        Depois só "consultamos" esse resultado em memória — muito
        mais rápido e seguro.
      */
      var mapaQuantidadePorLote = {};

      var buscaQuantidadePorLote = search.create({
        type: search.Type.INVENTORY_BALANCE,

        filters: [["item", "anyof", produtoEscolhido]],

        columns: [
          search.createColumn({
            name: "inventorynumber",
            summary: "GROUP",
          }),
          search.createColumn({
            name: "onhand",
            summary: "SUM",
          }),
        ],
      });

      var resultadoQuantidadePaginado = buscaQuantidadePorLote.runPaged({
        pageSize: 1000,
      });

      resultadoQuantidadePaginado.pageRanges.forEach(function (pageRange) {
        var pagina = resultadoQuantidadePaginado.fetch({
          index: pageRange.index,
        });

        pagina.data.forEach(function (linha) {
          var idLoteNaBusca = linha.getValue({
            name: "inventorynumber",
            summary: "GROUP",
          });

          var quantidadeDoLote = Number(
            linha.getValue({
              name: "onhand",
              summary: "SUM",
            }),
          );

          mapaQuantidadePorLote[idLoteNaBusca] = quantidadeDoLote;
        });
      });

      // Busca todos os lotes relacionados ao produto escolhido
      var buscaLote = search.create({
        type: search.Type.INVENTORY_NUMBER,

        filters: [["item", "anyof", produtoEscolhido]],

        columns: ["internalid", "item", "inventorynumber", "expirationdate"],
      });

      // Cria tabela para exibir os lotes encontrados
      var listaLotes = form.addSublist({
        id: "custpage_lotes",

        type: serverWidget.SublistType.LIST,

        label: "Lotes encontrados",
      });

      listaLotes.addField({
        id: "custpage_item",

        type: serverWidget.FieldType.TEXT,

        label: "Produto",
      });

      listaLotes.addField({
        id: "custpage_lote",

        type: serverWidget.FieldType.TEXT,

        label: "Lote",
      });

      listaLotes.addField({
        id: "custpage_datavalidade",

        type: serverWidget.FieldType.TEXT,

        label: "Data de Validade",
      });

      listaLotes.addField({
        id: "custpage_quantidade",

        type: serverWidget.FieldType.TEXT,

        label: "Quantidade",
      });

      // Contador usado para preencher as linhas da tabela (índice global,
      // já que agora percorremos várias páginas de resultado)
      var linhaAtual = 0;

      // Usa paginação para conseguir carregar milhares de lotes
      var resultadoLotesPaginado = buscaLote.runPaged({
        pageSize: 1000,
      });

      // Percorre todas as páginas de lotes encontradas
      resultadoLotesPaginado.pageRanges.forEach(function (pageRange) {
        var pagina = resultadoLotesPaginado.fetch({
          index: pageRange.index,
        });

        // Percorre os lotes da página atual
        pagina.data.forEach(function (item) {
          var produto = item.getText({
            name: "item",
          });

          var lote = item.getValue({
            name: "inventorynumber",
          });

          var validade = item.getValue({
            name: "expirationdate",
          });

          // ID do lote usado para consultar a quantidade no mapa
          // (já calculado antes, sem precisar de nova busca)
          var idLote = item.getValue({
            name: "internalid",
          });

          var quantidade = mapaQuantidadePorLote[idLote] || 0;

          // Soma todos os lotes para descobrir o estoque atual
          // Exemplo:
          // Lote A = 10
          // Lote B = 5
          // Estoque atual = 15
          estoqueAtual += quantidade;

          // Preenche os dados na tabela de lotes
          listaLotes.setSublistValue({
            id: "custpage_item",

            line: linhaAtual,

            value: produto,
          });

          listaLotes.setSublistValue({
            id: "custpage_lote",

            line: linhaAtual,

            value: lote,
          });

          if (validade) {
            listaLotes.setSublistValue({
              id: "custpage_datavalidade",

              line: linhaAtual,

              value: validade,
            });
          }

          listaLotes.setSublistValue({
            id: "custpage_quantidade",

            line: linhaAtual,

            value: String(quantidade),
          });

          linhaAtual++;
        });
      });

      /*
        Busca as movimentações de saída do produto.

        Exemplo de saída:
        Atendimento de item
        Baixa de item
        Transferência de estoque

        Essas movimentações mostram quanto o estoque consumiu.
      */

      /*
        CORREÇÃO: antes esse filtro não existia, por isso escolher
        30, 90, 180 ou 365 dias não mudava o resultado — a busca
        sempre trazia TODO o histórico de movimentações do produto.

        Agora filtramos pelo período escolhido, usando uma data
        relativa (ex: "daysago30" = "de 30 dias atrás até hoje").
      */

      // Se por algum motivo não vier período selecionado, usa 30 dias como padrão
      var diasDoPeriodo = periodoEscolhido || "30";

      var buscaSaida = search.create({
        type: search.Type.TRANSACTION,

        filters: [
          ["item", "anyof", produtoEscolhido],

          "AND",

          ["type", "anyof", "ItemShip", "InvAdjst"],

          "AND",

          ["trandate", "onorafter", "daysago" + diasDoPeriodo],
        ],

        columns: ["quantity", "trandate"],
      });

      // Soma toda quantidade que saiu no período escolhido
      var quantidadeSaida = 0;

      // Também usa paginação, para não perder movimentações
      // quando o produto tiver mais de 1000 transações registradas
      var resultadoSaidaPaginado = buscaSaida.runPaged({
        pageSize: 1000,
      });

      resultadoSaidaPaginado.pageRanges.forEach(function (pageRange) {
        var pagina = resultadoSaidaPaginado.fetch({
          index: pageRange.index,
        });

        pagina.data.forEach(function (saida) {
          quantidadeSaida += Math.abs(
            Number(
              saida.getValue({
                name: "quantity",
              }),
            ),
          );
        });
      });

      /*
        Calcula o giro de estoque.

        Fórmula:
        Giro = Quantidade consumida / Estoque atual

        Exemplo:

        Saiu 100 unidades
        Estoque atual 50 unidades

        Giro = 100 / 50

        Resultado:
        2 giros

        Significa que o estoque foi renovado
        aproximadamente 2 vezes.
      */

      var giroEstoque = 0;

      if (estoqueAtual > 0) {
        giroEstoque = quantidadeSaida / estoqueAtual;
      }

      // Mostra o resultado de forma mais fácil para o usuário entender
      campoGiro.defaultValue = giroEstoque.toFixed(2);

      /*
        Campo explicativo (em HTML) que aparece logo abaixo do resultado.
        A ideia é que qualquer pessoa, mesmo sem conhecimento técnico,
        entenda o que aquele número quer dizer na prática.
      */
      var campoExplicacao = form.addField({
        id: "custpage_explicacao_giro",
        type: serverWidget.FieldType.INLINEHTML,
        label: "O que esse número significa",
      });

      campoExplicacao.defaultValue =
        "<div style='max-width:500px; padding:8px; background:#f5f5f5; border-left:4px solid #2E75B6; font-size:13px;'>" +
        "Quanto maior o número, mais rápido esse produto está sendo vendido em relação ao que tem parado no estoque." +
        "</div>";
    }

    // Botão que envia o formulário
    form.addSubmitButton({
      label: "Pesquisar",
    });

    // Exibe o formulário na tela
    context.response.writePage(form);
  }

  return {
    onRequest: onRequest,
  };
});
