/**
 * Informa ao NetSuite qual versão da API será utilizada.
 * Define o tipo do script.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

define(['N/ui/serverWidget', 'N/search'], (serverWidget, search) => {

    function onRequest(context) {

        var form = serverWidget.createForm({
            title: "Giro de Estoque"
        });


        var campoProduto = form.addField({
            // cria o campo select para escolher o produto
            id: "custpage_produto",
            type: serverWidget.FieldType.SELECT,
            label: "Produto"
        })

        // faz a busca de todos os itens do tipo inventario
        var bucaItem = search.create({
            type: search.Type.ITEM,
            filters: ["type", "anyof", "InvtPart"],
            columns: ["internalid", "itemid"]
        })

        var resultadoItens = bucaItem.run().getRange({
            //ele pega os 1000 primeiros itens e os transforma em um array para poder percorrer e adicionar no select do campo produto
            start: 0,
            end: 1000
        })

        resultadoItens.forEach((item) => {
            // for q percorre os itens e adiciona no select do campo produto 
            campoProduto.addSelectOption({
                value: item.getValue({ name: "internalid" }),
                text: item.getValue({ name: "itemid" })
            })

        })


        var produtoEscolhido = context.request.parameters.custpage_produto
        form.addButton({
            // botao de busca mais ainda sem funcionalidade
            id: "custpage_btn_pesquisa",
            label: "Pesquisar"
        })

        context.response.writePage(form); // imprina na tela o formulario criado 



    }

    return {
        onRequest: onRequest
    };

});
