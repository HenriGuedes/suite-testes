/**
 * Informa ao NetSuite qual versão da API será utilizada.
 * Define o tipo do script.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

define(['N/ui/serverWidget', 'N/search'],  (serverWidget, search) => {

    function onRequest(context) {

        var form = serverWidget.createForm({
            title: "Giro de Estoque"
        });
        var bucaItem = search.create({
            type: search.type.ITEM,
            filters:["type", "anyof", "InvtPart"],
            columns:[ "internalid", "itemid"]
        })
        form.addField({
            id: "custpage_produto",
            type: serverWidget.FieldType.Select,
            label: "Produto"
        })
        var produtoEscolhido = context.request.parameters.custpage_produto
        form.addButton({
            id: "custpage_btn_pesquisa",
            label: "Pesquisar"
        })

        context.response.writePage(form);



    }

    return {
        onRequest: onRequest
    };

});
