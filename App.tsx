
import React, { useState } from 'react';
import { MUNICIPIOS_PR, TIPOLOGIAS, DANOS_OPCOES, ESTADOS_BR } from './constants';
import { ClassificacaoDano, Engenheiro, Laudo } from './types';
import { jsPDF } from 'jspdf';
import { GoogleGenAI } from "@google/genai";

const App: React.FC = () => {
  const [engenheiros, setEngenheiros] = useState<Engenheiro[]>([
    { id: '1', nome: 'Daniel', crea: '98.123/D', estado: 'PR' },
    { id: '2', nome: 'Débora', crea: '98.123/D', estado: 'PR' },
    { id: '3', nome: 'Lorena', crea: '98.123/D', estado: 'PR' },
    { id: '4', nome: 'Tainara', crea: '98.123/D', estado: 'PR' },
  ]);

  const [showEngForm, setShowEngForm] = useState(false);
  const [newEng, setNewEng] = useState<Partial<Engenheiro>>({ estado: 'PR' });
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);

  const [formData, setFormData] = useState<Laudo>({
    municipio: '',
    data: new Date().toISOString().split('T')[0],
    engenheiroId: '',
    inscricaoMunicipal: '',
    proprietario: '',
    requerente: '',
    endereco: '',
    coordenadas: { lat: '', lng: '' },
    tipologia: '',
    tipologiaOutro: '',
    danos: [],
    classificacao: ClassificacaoDano.MINIMOS,
    nivelDestruicao: 'Sem Destruição',
    percentualDestruicao: '10%'
  });

  const updateCalculatedFields = (classificacao: ClassificacaoDano) => {
    let nivel = '';
    let perc = '';
    switch (classificacao) {
      case ClassificacaoDano.MINIMOS:
        nivel = 'Sem Destruição';
        perc = '10%';
        break;
      case ClassificacaoDano.PARCIAIS:
        nivel = 'Destruição Parcial Leve';
        perc = '40%';
        break;
      case ClassificacaoDano.SEVEROS:
        nivel = 'Destruição Parcial Grave';
        perc = '70%';
        break;
      case ClassificacaoDano.RUINA:
        nivel = 'Destruição Total';
        perc = '100%';
        break;
    }
    setFormData(prev => ({ ...prev, classificacao, nivelDestruicao: nivel, percentualDestruicao: perc }));
  };

  const handleAddEngenheiro = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEng.nome && newEng.crea && newEng.estado) {
      const engineer: Engenheiro = {
        id: Date.now().toString(),
        nome: newEng.nome,
        crea: newEng.crea,
        estado: newEng.estado,
      };
      setEngenheiros(prev => [...prev, engineer]);
      setFormData(prev => ({ ...prev, engenheiroId: engineer.id }));
      setNewEng({ estado: 'PR' });
      setShowEngForm(false);
    }
  };

  const handleEngenheiroChange = (id: string) => {
    if (id === 'OUTRO') {
      setShowEngForm(true);
    } else {
      setFormData(prev => ({ ...prev, engenheiroId: id }));
    }
  };

  const handleDanoToggle = (dano: string) => {
    setFormData(prev => {
      const exists = prev.danos.find(d => d.tipo === dano);
      if (exists) {
        return { ...prev, danos: prev.danos.filter(d => d.tipo !== dano) };
      } else {
        return { ...prev, danos: [...prev.danos, { tipo: dano, descricao: '', fotos: [] }] };
      }
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handlePhotoUpload = async (danoTipo: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      try {
        const base64Photos = await Promise.all(files.map(file => fileToBase64(file as File)));
        setFormData(prev => ({
          ...prev,
          danos: prev.danos.map(d => d.tipo === danoTipo ? { ...d, fotos: [...d.fotos, ...base64Photos] } : d)
        }));
        if (base64Photos.length > 0) {
          analyzeDamageWithAI(danoTipo, base64Photos[0]);
        }
      } catch (err) {
        console.error("Erro no upload:", err);
      }
    }
  };

  const analyzeDamageWithAI = async (danoTipo: string, base64Image: string) => {
    setIsAnalyzing(danoTipo);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Data = base64Image.split(',')[1];
      const mimeType = base64Image.split(';')[0].split(':')[1];
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: `Você é um engenheiro da Defesa Civil do Paraná. Descreva tecnicamente o dano no elemento "${danoTipo}" visível nesta imagem. Seja sucinto e use terminologia de engenharia diagnóstica. Responda apenas com a descrição técnica.` }
          ]
        }
      });
      const description = response.text || '';
      setFormData(prev => ({
        ...prev,
        danos: prev.danos.map(d => d.tipo === danoTipo ? { ...d, descricao: description } : d)
      }));
    } catch (error) {
      console.error("AI Analysis failed:", error);
    } finally {
      setIsAnalyzing(null);
    }
  };

  const drawHeader = (doc: jsPDF) => {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('ESTADO DO PARANÁ', 105, 20, { align: 'center' });
    doc.text('COORDENADORIA ESTADUAL DA DEFESA CIVIL', 105, 25, { align: 'center' });
    doc.text('FUNDO ESTADUAL PARA CALAMIDADES PÚBLICAS', 105, 30, { align: 'center' });
  };

  const drawFooter = (doc: jsPDF) => {
    const pageHeight = doc.internal.pageSize.height;
    doc.setDrawColor(0, 102, 204);
    doc.setLineWidth(1.5);
    doc.line(20, pageHeight - 25, 150, pageHeight - 25);
    doc.setDrawColor(0, 153, 51);
    doc.line(150, pageHeight - 25, 190, pageHeight - 25);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Palácio das Araucárias - 1º andar - Setor C | Centro Cívico | Curitiba/PR | CEP 80.530-140', 105, pageHeight - 18, { align: 'center' });
    doc.text('E-mail: defesacivil@defesacivil.pr.gov.br | Fone: (41) 3281-2500', 105, pageHeight - 14, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text('“Defesa Civil somos todos nós”', 105, pageHeight - 8, { align: 'center' });
  };

  const generatePDF = async () => {
    const doc = new jsPDF();
    const eng = engenheiros.find(e => e.id === formData.engenheiroId);
    
    // PAGE 1
    drawHeader(doc);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('LAUDO DE IMÓVEL AFETADO POR EVENTO CLIMÁTICO', 105, 50, { align: 'center' });
    doc.setFontSize(11);
    doc.text(`MUNICÍPIO: ${formData.municipio.toUpperCase()}`, 20, 65);
    doc.text(`DATA: ${formData.data}`, 20, 75);
    doc.text('INFORMAÇÕES DO IMÓVEL', 105, 95, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`INSCRIÇÃO MUNICIPAL: ${formData.inscricaoMunicipal}`, 20, 110);
    doc.text(`PROPRIETÁRIO: ${formData.proprietario.toUpperCase()}`, 20, 120);
    doc.text(`REQUERENTE: ${formData.requerente.toUpperCase()}`, 20, 130);
    doc.text(`ENDEREÇO: ${formData.endereco.toUpperCase()}`, 20, 140);
    doc.text(`COORDENADAS: ${formData.coordenadas.lat}, ${formData.coordenadas.lng}`, 20, 150);
    doc.text(`TIPOLOGIA: ${formData.tipologia === 'Outro' ? formData.tipologiaOutro?.toUpperCase() : formData.tipologia.toUpperCase()}`, 20, 160);
    drawFooter(doc);

    // PAGE 2 (Levantamento de Danos)
    doc.addPage();
    drawHeader(doc);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('LEVANTAMENTO DE DANOS', 105, 50, { align: 'center' });
    
    let y = 65;
    formData.danos.forEach((dano) => {
      if (y > 220) {
        drawFooter(doc);
        doc.addPage();
        drawHeader(doc);
        y = 50;
      }
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${dano.tipo.toUpperCase()}:`, 20, y);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(dano.descricao, 170);
      doc.text(lines, 20, y + 5);
      y += 10 + (lines.length * 5);
      if (dano.fotos.length > 0) {
        let photoX = 20;
        dano.fotos.slice(0, 2).forEach((foto) => {
          try {
            doc.addImage(foto, 'JPEG', photoX, y, 80, 60);
            photoX += 90;
          } catch(e) { console.error(e); }
        });
        y += 70;
      }
      y += 5;
    });

    if (y > 180) {
      drawFooter(doc);
      doc.addPage();
      drawHeader(doc);
      y = 50;
    }

    doc.setFont('helvetica', 'bold');
    doc.text('AVALIAÇÃO FINAL', 105, y + 20, { align: 'center' });
    y += 35;
    doc.setFontSize(10);
    doc.text(`CLASSIFICAÇÃO: ${formData.classificacao.toUpperCase()}`, 20, y);
    doc.text(`NÍVEL DE DESTRUIÇÃO: ${formData.nivelDestruicao.toUpperCase()}`, 20, y + 10);
    doc.text(`PERCENTUAL CONSIDERADO DE DESTRUIÇÃO: ${formData.percentualDestruicao}`, 20, y + 20);
    
    y += 50;
    doc.setFont('helvetica', 'bold');
    doc.text(eng ? eng.nome.toUpperCase() : 'NOME DO ENGENHEIRO NÃO INFORMADO', 105, y, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text('Engenheiro Civil', 105, y + 5, { align: 'center' });
    doc.text(eng ? `CREA ${eng.estado} ${eng.crea}` : 'REGISTRO NÃO INFORMADO', 105, y + 10, { align: 'center' });
    
    drawFooter(doc);
    doc.save(`laudo_${formData.municipio}_${Date.now()}.pdf`);
  };

  const inputClasses = "w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-orange-500 outline-none bg-white text-black placeholder-slate-400";

  return (
    <div className="min-h-screen pb-20 bg-slate-50">
      <header className="bg-orange-600 text-white p-6 shadow-lg mb-8">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="bg-white p-2 rounded-full">
                <svg className="w-10 h-10 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L1 21h22L12 2zm0 3.45l8.15 14.1H3.85L12 5.45zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
                </svg>
             </div>
             <div>
               <h1 className="text-2xl font-bold uppercase tracking-tight">Defesa Civil Paraná</h1>
               <p className="text-sm opacity-90">Emissão de Laudo Técnico de Imóveis</p>
             </div>
          </div>
          <div className="mt-4 md:mt-0">
             <span className="text-xs bg-orange-700 px-3 py-1 rounded-full border border-orange-400 font-semibold">Sistema Oficial de Laudos</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-5xl">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden border border-slate-200">
          <div className="p-6 bg-slate-100 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 uppercase">1. Identificação Geral</h2>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Data da Inspeção</label>
              <input type="date" value={formData.data} onChange={e => setFormData({...formData, data: e.target.value})} className={inputClasses} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Município</label>
              <select value={formData.municipio} onChange={e => setFormData({...formData, municipio: e.target.value})} className={inputClasses}>
                <option value="">Selecione um Município</option>
                {MUNICIPIOS_PR.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Engenheiro Responsável</label>
              <select 
                value={formData.engenheiroId} 
                onChange={e => handleEngenheiroChange(e.target.value)} 
                className={inputClasses}
              >
                <option value="">Selecione...</option>
                {engenheiros.map(e => (
                  <option key={e.id} value={e.id}>{e.nome} (CREA-{e.estado} {e.crea})</option>
                ))}
                <option value="OUTRO" className="font-bold text-orange-600">Outro (Cadastrar novo...)</option>
              </select>
            </div>
          </div>

          <div className="p-6 border-t border-slate-200 bg-white">
            <h3 className="text-md font-bold text-slate-800 uppercase mb-4">2. Dados do Imóvel e Localização</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Inscrição Municipal</label>
                <input type="number" value={formData.inscricaoMunicipal} onChange={e => setFormData({...formData, inscricaoMunicipal: e.target.value})} className={inputClasses} placeholder="Digite o número da inscrição" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Proprietário</label>
                <input type="text" value={formData.proprietario} onChange={e => setFormData({...formData, proprietario: e.target.value})} className={inputClasses} placeholder="Nome do Proprietário" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Requerente</label>
                <input type="text" value={formData.requerente} onChange={e => setFormData({...formData, requerente: e.target.value})} className={inputClasses} placeholder="Nome do Requerente" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Endereço Completo</label>
                <input type="text" value={formData.endereco} onChange={e => setFormData({...formData, endereco: e.target.value})} className={inputClasses} placeholder="Rua, Número, Bairro, CEP" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Latitude</label>
                <input type="text" value={formData.coordenadas.lat} onChange={e => setFormData({...formData, coordenadas: {...formData.coordenadas, lat: e.target.value}})} className={inputClasses} placeholder="Ex: -25.4284" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Longitude</label>
                <input type="text" value={formData.coordenadas.lng} onChange={e => setFormData({...formData, coordenadas: {...formData.coordenadas, lng: e.target.value}})} className={inputClasses} placeholder="Ex: -49.2733" />
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-200">
             <h3 className="text-md font-bold text-slate-800 mb-4 uppercase">3. Tipologia da Edificação</h3>
             <select value={formData.tipologia} onChange={e => setFormData({...formData, tipologia: e.target.value})} className={inputClasses}>
                <option value="">Selecione...</option>
                {TIPOLOGIAS.map(t => <option key={t} value={t}>{t}</option>)}
             </select>
             {formData.tipologia === 'Outro' && (
               <div className="mt-4 animate-in fade-in zoom-in duration-200">
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Descrição Detalhada</label>
                 <textarea value={formData.tipologiaOutro} onChange={e => setFormData({...formData, tipologiaOutro: e.target.value})} className={inputClasses} rows={2} />
               </div>
             )}
          </div>

          <div className="p-6 border-t border-slate-200 bg-slate-50">
            <h3 className="text-md font-bold text-slate-800 mb-4 uppercase">4. Levantamento de Danos</h3>
            <div className="flex flex-wrap gap-2 mb-6">
              {DANOS_OPCOES.map(dano => (
                <button
                  key={dano}
                  onClick={() => handleDanoToggle(dano)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold border transition-all ${
                    formData.danos.find(d => d.tipo === dano)
                    ? 'bg-orange-600 text-white border-orange-700 shadow-md transform scale-105'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-orange-500 active:scale-95'
                  }`}
                >
                  {dano}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {formData.danos.map((dano) => (
                <div key={dano.tipo} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-orange-700 uppercase text-xs tracking-wider bg-orange-50 px-2 py-1 rounded">{dano.tipo}</span>
                      {isAnalyzing === dano.tipo && <span className="text-[10px] animate-pulse text-blue-600 font-bold italic">Analisando imagem com IA...</span>}
                    </div>
                    <button onClick={() => handleDanoToggle(dano.tipo)} className="text-xs text-red-500 hover:text-red-700 font-bold">REMOVER</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Descrição Técnica</label>
                      <textarea
                        value={dano.descricao}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          danos: prev.danos.map(d => d.tipo === dano.tipo ? { ...d, descricao: e.target.value } : d)
                        }))}
                        className={`${inputClasses} text-sm`}
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Fotos (Análise Automática IA)</label>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={e => handlePhotoUpload(dano.tipo, e)}
                        className="text-xs block w-full text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-orange-200 file:text-xs file:font-bold file:bg-orange-50 file:text-orange-700 cursor-pointer"
                      />
                      <div className="flex flex-wrap gap-2 mt-2">
                        {dano.fotos.map((foto, fIdx) => (
                          <img key={fIdx} src={foto} className="w-16 h-16 object-cover rounded border border-slate-200 shadow-sm" alt="Dano" />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 border-t border-slate-200 bg-white">
            <h3 className="text-md font-bold text-slate-800 mb-4 uppercase">5. Avaliação Final</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Classificação</label>
                <select
                  value={formData.classificacao}
                  onChange={e => updateCalculatedFields(e.target.value as ClassificacaoDano)}
                  className={`${inputClasses} font-bold text-orange-700`}
                >
                  {Object.values(ClassificacaoDano).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1 text-center">Nível de Destruição</label>
                <div className="p-2 border border-slate-200 rounded bg-slate-50 text-slate-800 font-bold uppercase text-center text-sm">{formData.nivelDestruicao}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1 text-center">Percentual</label>
                <div className="p-2 border border-slate-200 rounded bg-slate-50 text-slate-800 font-bold text-center text-sm">{formData.percentualDestruicao}</div>
              </div>
            </div>
          </div>

          <div className="p-8 bg-slate-800 flex justify-center">
            <button
              onClick={generatePDF}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 px-16 rounded shadow-2xl transition-all flex items-center gap-3 transform hover:-translate-y-1 active:scale-95 text-lg"
            >
              FINALIZAR LAUDO E GERAR PDF
            </button>
          </div>
        </div>
      </main>

      {/* Modals */}
      {showEngForm && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-4 bg-orange-600 text-white font-bold flex justify-between items-center">
              <span>CADASTRAR NOVO ENGENHEIRO</span>
              <button onClick={() => setShowEngForm(false)} className="text-2xl">&times;</button>
            </div>
            <form onSubmit={handleAddEngenheiro} className="p-8 space-y-4">
              <input required type="text" value={newEng.nome || ''} onChange={e => setNewEng({...newEng, nome: e.target.value})} className={inputClasses} placeholder="Nome Completo" />
              <div className="grid grid-cols-2 gap-4">
                <input required type="text" value={newEng.crea || ''} onChange={e => setNewEng({...newEng, crea: e.target.value})} className={inputClasses} placeholder="Registro CREA" />
                <select required value={newEng.estado || 'PR'} onChange={e => setNewEng({...newEng, estado: e.target.value})} className={inputClasses}>
                  {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
              <input type="text" className={inputClasses} placeholder="Endereço de Contato" />
              <input type="tel" className={inputClasses} placeholder="Telefone de Contato" />
              <button type="submit" className="w-full bg-orange-600 text-white py-3 rounded font-bold hover:bg-orange-700 shadow-lg">SALVAR E SELECIONAR</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
