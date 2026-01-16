
import React, { useState, useEffect } from 'react';
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
  const [showMap, setShowMap] = useState(false);
  const [mapLayer, setMapLayer] = useState<'streets' | 'hybrid'>('hybrid');
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

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'MAP_CLICK') {
        const { lat, lng } = event.data;
        handleMapSelection(lat, lng);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleMapSelection = async (lat: number, lng: number) => {
    setFormData(prev => ({
      ...prev,
      coordenadas: { lat: lat.toFixed(6), lng: lng.toFixed(6) }
    }));

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`);
      const data = await res.json();
      if (data.address) {
        const addr = data.address;
        const street = addr.road || addr.pedestrian || '';
        const number = addr.house_number || 'S/N';
        const neighborhood = addr.suburb || addr.neighbourhood || addr.city_district || '';
        const postcode = addr.postcode || '';
        
        const formattedAddress = `${street}, ${number}, ${neighborhood} - CEP: ${postcode}`;
        setFormData(prev => ({ ...prev, endereco: formattedAddress }));
      }
    } catch (e) {
      console.error("Geocoding failed", e);
    }
  };

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
    
    doc.setDrawColor(200);
    doc.rect(20, 15, 25, 20); 
    doc.rect(165, 15, 25, 20); 
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
    doc.setDrawColor(0);
    doc.rect(20, 155, 170, 80);
    doc.setFontSize(8);
    doc.text('MAPA DE LOCALIZAÇÃO', 105, 195, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`TIPOLOGIA: ${formData.tipologia === 'Outro' ? formData.tipologiaOutro?.toUpperCase() : formData.tipologia.toUpperCase()}`, 20, 255);
    drawFooter(doc);

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
    doc.text('AÇÕES DO EVENTO CLIMÁTICO', 105, y + 20, { align: 'center' });
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
    doc.save(`laudo_${formData.municipio || 'dc_pr'}_${Date.now()}.pdf`);
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
               <p className="text-sm opacity-90 text-orange-100">Portal de Emissão de Laudos Técnicos</p>
             </div>
          </div>
          <div className="mt-4 md:mt-0">
             <span className="text-xs bg-orange-700 px-3 py-1 rounded-full border border-orange-400 font-semibold shadow-inner">Sistema Oficial PR</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-5xl">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden border border-slate-200">
          <div className="p-6 bg-slate-100 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 uppercase flex items-center gap-2">
              <span className="bg-orange-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
              Identificação do Laudo
            </h2>
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
                <option value="OUTRO" className="font-bold text-orange-600 underline">Cadastrar novo engenheiro...</option>
              </select>
            </div>
          </div>

          <div className="p-6 border-t border-slate-200 bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-md font-bold text-slate-800 uppercase flex items-center gap-2">
                <span className="bg-orange-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                Localização do Imóvel
              </h3>
              <button 
                onClick={() => {
                  setMapLayer('hybrid');
                  setShowMap(true);
                }}
                className="text-xs bg-orange-600 text-white px-4 py-2 rounded-md font-bold shadow-md hover:bg-orange-700 transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                ABRIR MAPA PARA MARCAÇÃO
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Inscrição Municipal</label>
                <input type="number" value={formData.inscricaoMunicipal} onChange={e => setFormData({...formData, inscricaoMunicipal: e.target.value})} className={inputClasses} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Proprietário</label>
                <input type="text" value={formData.proprietario} onChange={e => setFormData({...formData, proprietario: e.target.value})} className={inputClasses} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Requerente</label>
                <input type="text" value={formData.requerente} onChange={e => setFormData({...formData, requerente: e.target.value})} className={inputClasses} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Endereço Completo</label>
                <input type="text" value={formData.endereco} onChange={e => setFormData({...formData, endereco: e.target.value})} className={inputClasses} placeholder="Arraste o pin no mapa para preencher..." />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Latitude</label>
                <input type="text" value={formData.coordenadas.lat} onChange={e => setFormData({...formData, coordenadas: {...formData.coordenadas, lat: e.target.value}})} className={inputClasses} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Longitude</label>
                <input type="text" value={formData.coordenadas.lng} onChange={e => setFormData({...formData, coordenadas: {...formData.coordenadas, lng: e.target.value}})} className={inputClasses} />
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-200">
             <h3 className="text-md font-bold text-slate-800 mb-4 uppercase flex items-center gap-2">
                <span className="bg-orange-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">3</span>
                Tipologia da Edificação
             </h3>
             <select value={formData.tipologia} onChange={e => setFormData({...formData, tipologia: e.target.value})} className={inputClasses}>
                <option value="">Selecione...</option>
                {TIPOLOGIAS.map(t => <option key={t} value={t}>{t}</option>)}
             </select>
             {formData.tipologia === 'Outro' && (
               <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Descreva a Tipologia</label>
                 <textarea value={formData.tipologiaOutro} onChange={e => setFormData({...formData, tipologiaOutro: e.target.value})} className={inputClasses} rows={2} />
               </div>
             )}
          </div>

          <div className="p-6 border-t border-slate-200 bg-slate-50">
            <h3 className="text-md font-bold text-slate-800 mb-4 uppercase flex items-center gap-2">
                <span className="bg-orange-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">4</span>
                Levantamento Detalhado de Danos
            </h3>
            <div className="flex flex-wrap gap-2 mb-6">
              {DANOS_OPCOES.map(dano => (
                <button
                  key={dano}
                  onClick={() => handleDanoToggle(dano)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold border transition-all ${
                    formData.danos.find(d => d.tipo === dano)
                    ? 'bg-orange-600 text-white border-orange-700 shadow-lg transform scale-105'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-orange-500 hover:shadow-sm'
                  }`}
                >
                  {dano}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {formData.danos.map((dano) => (
                <div key={dano.tipo} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-orange-700 uppercase text-xs tracking-wider bg-orange-50 px-2 py-1 rounded">{dano.tipo}</span>
                      {isAnalyzing === dano.tipo && <span className="text-[10px] animate-pulse text-blue-600 font-bold italic">Processando Inteligência Artificial...</span>}
                    </div>
                    <button onClick={() => handleDanoToggle(dano.tipo)} className="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1 rounded hover:bg-red-50">REMOVER</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Descrição Técnica (IA Autocomplete)</label>
                      <textarea
                        value={dano.descricao}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          danos: prev.danos.map(d => d.tipo === dano.tipo ? { ...d, descricao: e.target.value } : d)
                        }))}
                        className={`${inputClasses} text-sm`}
                        rows={3}
                        placeholder="Adicione uma foto para gerar a descrição via IA..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Anexar Fotos Comprobatórias</label>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={e => handlePhotoUpload(dano.tipo, e)}
                        className="text-xs block w-full text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-bold file:bg-orange-600 file:text-white cursor-pointer"
                      />
                      <div className="flex flex-wrap gap-2 mt-2">
                        {dano.fotos.map((foto, fIdx) => (
                          <div key={fIdx} className="relative group">
                             <img src={foto} className="w-16 h-16 object-cover rounded border border-slate-200 shadow-sm" alt="Dano" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 border-t border-slate-200 bg-white">
            <h3 className="text-md font-bold text-slate-800 mb-4 uppercase flex items-center gap-2">
                <span className="bg-orange-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">5</span>
                Avaliação e Classificação Final
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Classificação do Dano</label>
                <select
                  value={formData.classificacao}
                  onChange={e => updateCalculatedFields(e.target.value as ClassificacaoDano)}
                  className={`${inputClasses} font-bold text-orange-700 bg-orange-50/30`}
                >
                  {Object.values(ClassificacaoDano).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1 text-center">Nível de Destruição Estimado</label>
                <div className="p-2 border border-slate-200 rounded bg-slate-50 text-slate-800 font-bold uppercase text-center text-sm shadow-inner">{formData.nivelDestruicao}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1 text-center">Percentual Médio</label>
                <div className="p-2 border border-slate-200 rounded bg-slate-50 text-slate-800 font-bold text-center text-sm shadow-inner">{formData.percentualDestruicao}</div>
              </div>
            </div>
          </div>

          <div className="p-8 bg-slate-800 flex justify-center">
            <button
              onClick={generatePDF}
              className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 px-16 rounded-lg shadow-2xl transition-all flex items-center gap-4 transform hover:-translate-y-1 active:scale-95 text-lg"
            >
              GERAR LAUDO TÉCNICO (PDF)
            </button>
          </div>
        </div>
      </main>

      {/* Modals */}
      {showEngForm && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-300">
            <div className="p-4 bg-orange-600 text-white font-bold flex justify-between items-center shadow-lg">
              <span className="tracking-wide">CADASTRO DE ENGENHEIRO</span>
              <button onClick={() => setShowEngForm(false)} className="text-2xl hover:text-orange-200">&times;</button>
            </div>
            <form onSubmit={handleAddEngenheiro} className="p-8 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Nome Completo</label>
                <input required type="text" value={newEng.nome || ''} onChange={e => setNewEng({...newEng, nome: e.target.value})} className={inputClasses} placeholder="Ex: Eng. João da Silva" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Número CREA</label>
                  <input required type="text" value={newEng.crea || ''} onChange={e => setNewEng({...newEng, crea: e.target.value})} className={inputClasses} placeholder="Ex: 12345/D" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">UF</label>
                  <select required value={newEng.estado || 'PR'} onChange={e => setNewEng({...newEng, estado: e.target.value})} className={inputClasses}>
                    {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 transition-colors shadow-lg active:scale-95">SALVAR E SELECIONAR</button>
            </form>
          </div>
        </div>
      )}

      {showMap && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden h-[85vh] flex flex-col border border-white/20">
            <div className="p-4 bg-slate-800 text-white font-bold flex justify-between items-center">
              <span>SELECIONAR LOCALIZAÇÃO NO MAPA</span>
              <button onClick={() => setShowMap(false)} className="text-2xl hover:text-orange-500 transition-colors">&times;</button>
            </div>
            <div className="relative flex-1 bg-slate-200">
              <div className="absolute top-4 left-4 z-[120] flex gap-2">
                <button onClick={() => setMapLayer('streets')} className={`px-4 py-2 rounded-lg text-xs font-bold shadow-xl transition-all ${mapLayer === 'streets' ? 'bg-orange-600 text-white' : 'bg-white text-slate-800'}`}>MODO RUA</button>
                <button onClick={() => setMapLayer('hybrid')} className={`px-4 py-2 rounded-lg text-xs font-bold shadow-xl transition-all ${mapLayer === 'hybrid' ? 'bg-orange-600 text-white' : 'bg-white text-slate-800'}`}>MODO HÍBRIDO</button>
              </div>
              <iframe className="w-full h-full border-0" srcDoc={`
                <!DOCTYPE html><html><head>
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                <style>#map { height: 100vh; cursor: crosshair; }</style></head>
                <body><div id="map"></div><script>
                  const map = L.map('map');
                  const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
                  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
                  const labelsCity = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}');
                  const labelsAlt = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}');

                  if ("${mapLayer}" === 'hybrid') {
                    satellite.addTo(map);
                    labelsCity.addTo(map);
                    labelsAlt.addTo(map);
                  } else {
                    streets.addTo(map);
                  }

                  const searchCity = "${formData.municipio}" ? "${formData.municipio}" + ", Paraná, Brasil" : "Curitiba, Paraná, Brasil";
                  
                  fetch("https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(searchCity))
                    .then(r => r.json())
                    .then(data => {
                      if (data.length > 0) {
                        map.setView([data[0].lat, data[0].lon], 16);
                      } else {
                        map.setView([-24.675, -51.278], 7); // Centro do PR
                      }
                    })
                    .catch(() => map.setView([-24.675, -51.278], 7));

                  let m; 
                  map.on('click', e => {
                    const { lat, lng } = e.latlng;
                    if (m) m.remove(); m = L.marker([lat, lng]).addTo(map);
                    window.parent.postMessage({ type: 'MAP_CLICK', lat, lng }, '*');
                  });
                </script></body></html>
              `} />
            </div>
            <div className="p-4 bg-slate-100 border-t flex justify-between items-center shadow-inner">
              <div className="text-xs font-mono bg-white px-3 py-1 rounded border border-slate-300">
                 COORDENADAS: {formData.coordenadas.lat || '---'}, {formData.coordenadas.lng || '---'}
              </div>
              <button onClick={() => setShowMap(false)} className="bg-orange-600 text-white px-10 py-2 rounded-lg font-bold hover:bg-orange-700 shadow-md active:scale-95 transition-all">CONFIRMAR LOCALIZAÇÃO</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
