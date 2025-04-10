---
layout: page
title: "Simulador de Investimentos"
permalink: /investment-simulator/
---

# Simulador de Investimentos

Abaixo está nossa ferramenta interativa de simulação de investimentos. Ajuste os parâmetros e clique em "Executar Simulação."

<!-- BEGIN RAW HTML/JS -->
<div>
  <form id="simulatorForm">
    <div>
      <label for="initialAmount">Valor do Investimento Inicial:</label>
      <input type="number" id="initialAmount" required value="10000">
    </div>
    <div>
      <label for="startYear">Ano Inicial:</label>
      <input type="number" id="startYear" value="2025" required>
    </div>
    <div>
      <label for="simulationYears">Duração da Simulação (Anos):</label>
      <input type="number" id="simulationYears" value="30" required>
    </div>
    <div>
      <label for="returnRate">Taxa de Retorno Anual (%):</label>
      <input type="number" id="returnRate" step="0.1" value="5" required>
    </div>
    <div>
      <label for="inflationRate">Taxa de Inflação Anual (%):</label>
      <input type="number" id="inflationRate" step="0.1" value="2" required>
    </div>
    <div>
      <label for="taxRate">Taxa de Impostos sobre Ganhos (%):</label>
      <input type="number" id="taxRate" step="0.1" value="20" required>
    </div>

    <h3>Investimentos Extras (Opcional)</h3>
    <div id="extraInvestments">
      <div class="investment">
        <label>Data (Ano):</label>
        <input type="number" class="investment-year" value="2025">
        <label>Valor:</label>
        <input type="number" class="investment-amount" value="0">
      </div>
    </div>
    <button type="button" id="addInvestment">Adicionar Outro Investimento</button>

    <br><br>
    <button type="submit">Executar Simulação</button>
  </form>
</div>

<div id="results"></div>

<!-- Um canvas para o gráfico Chart.js -->
<canvas id="chartCanvas" width="600" height="400"></canvas>

<!-- Incluindo Chart.js via CDN -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<script>
  // Adiciona um novo campo para investimento extra quando o botão é clicado.
  document.getElementById('addInvestment').addEventListener('click', function() {
    var container = document.getElementById('extraInvestments');
    var div = document.createElement('div');
    div.className = 'investment';
    div.innerHTML =
      '<label>Data (Ano):</label><input type="number" class="investment-year" value="2025"> ' +
      '<label>Valor:</label><input type="number" class="investment-amount" value="0">';
    container.appendChild(div);
  });

  // Quando o formulário for enviado, executa a simulação.
  document.getElementById('simulatorForm').addEventListener('submit', function(e) {
    e.preventDefault();
    runSimulation();
  });

  function runSimulation() {
    // Recupera os valores dos inputs.
    var initialAmount = parseFloat(document.getElementById('initialAmount').value);
    var startYear = parseInt(document.getElementById('startYear').value);
    var simulationYears = parseInt(document.getElementById('simulationYears').value);
    var returnRate = parseFloat(document.getElementById('returnRate').value) / 100;
    var inflationRate = parseFloat(document.getElementById('inflationRate').value) / 100;
    var taxRate = parseFloat(document.getElementById('taxRate').value) / 100;

    // Agrega os investimentos extras em um objeto indexado pelo ano.
    var extraInvestmentsElems = document.getElementsByClassName('investment');
    var extraContribs = {};
    for (var i = 0; i < extraInvestmentsElems.length; i++) {
      var year = parseInt(extraInvestmentsElems[i].querySelector('.investment-year').value);
      var amt = parseFloat(extraInvestmentsElems[i].querySelector('.investment-amount').value);
      if (!isNaN(year) && !isNaN(amt) && amt !== 0) {
        if (!extraContribs[year]) {
          extraContribs[year] = 0;
        }
        extraContribs[year] += amt;
      }
    }

    // Prepara arrays para armazenar os resultados da simulação.
    var years = [];
    var nominalValues = [];
    var realValues = [];
    var nominalGrowthRates = [];
    var realGrowthRates = [];
    var distributions = [];

    var currentNominal = initialAmount;

    // Ano 0
    years.push(startYear);
    nominalValues.push(currentNominal);
    realValues.push(currentNominal); // no início, nominal == real
    nominalGrowthRates.push(0);
    realGrowthRates.push(0);
    distributions.push(0);

    // Executa a simulação para cada ano subsequente.
    for (var i = 1; i <= simulationYears; i++) {
      var year = startYear + i;
      // Adiciona qualquer investimento extra para o ano atual.
      var contrib = extraContribs[year] || 0;
      currentNominal += contrib;

      // Valor antes do crescimento para comparação nominal.
      var preGrowthNom = currentNominal;
      // Aplica o retorno nominal.
      currentNominal = currentNominal * (1 + returnRate);
      var nominalGrowth = (currentNominal / preGrowthNom) - 1;

      years.push(year);
      nominalValues.push(currentNominal);
      nominalGrowthRates.push(nominalGrowth * 100);

      // Valor real após ajustar pela inflação acumulada.
      var currentReal = currentNominal / Math.pow((1 + inflationRate), i);
      realValues.push(currentReal);

      var previousReal = realValues[i - 1];
      var baseReal = previousReal + contrib;
      var realGrowth = (currentReal / baseReal) - 1;
      realGrowthRates.push(realGrowth * 100);

      // Ganhos reais acima da inflação, subtraindo impostos.
      var realEarnings = currentReal - baseReal;
      var netRealEarnings = realEarnings * (1 - taxRate);
      distributions.push(netRealEarnings);
    }

    // Constrói a tabela de resultados.
    var resultsDiv = document.getElementById('results');
    var html = '<h2>Resultados da Simulação</h2>';
    html += '<table>';
    html += '<tr><th>Ano</th><th>Valor Nominal</th><th>Valor Real</th>' +
            '<th>Crescimento Nominal (%)</th><th>Crescimento Real (%)</th>' +
            '<th>Distribuição Anual (Real, pós-impostos)</th>' +
            '<th>Distribuição Mensal (Real, pós-impostos)</th></tr>';

    for (var i = 0; i < years.length; i++) {
      var monthlyDist = distributions[i] / 12;
      html += '<tr>';
      html += '<td>' + years[i] + '</td>';
      html += '<td>' + nominalValues[i].toFixed(2) + '</td>';
      html += '<td>' + realValues[i].toFixed(2) + '</td>';
      html += '<td>' + nominalGrowthRates[i].toFixed(2) + '</td>';
      html += '<td>' + realGrowthRates[i].toFixed(2) + '</td>';
      html += '<td>' + distributions[i].toFixed(2) + '</td>';
      html += '<td>' + monthlyDist.toFixed(2) + '</td>';
      html += '</tr>';
    }
    html += '</table>';
    resultsDiv.innerHTML = html;

    // Plota com Chart.js.
    var ctx = document.getElementById('chartCanvas').getContext('2d');
    if (window.simulationChart) {
      window.simulationChart.destroy();
    }
    window.simulationChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: years,
        datasets: [
          {
            label: 'Valor Nominal',
            data: nominalValues,
            borderColor: 'blue',
            fill: false
          },
          {
            label: 'Valor Real',
            data: realValues,
            borderColor: 'green',
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }
</script>
<!-- END RAW HTML/JS -->
