
import React, { useState, useEffect, useRef } from 'react';
import { MUNICIPIOS_PR, TIPOLOGIAS, DANOS_OPCOES, ESTADOS_BR } from './constants';
import { ClassificacaoDano, Engenheiro, Laudo } from './types';
import { jsPDF } from 'jspdf';

declare const L: any;

const App: React.FC = () => {
  const [engenheiros, setEngenheiros] = useState<Engenheiro[]>([
    { id: '1', nome: 'Daniel', crea: '98.123/D', estado: 'PR' },
    { id: '2', nome: 'Débora', crea: '98.123/D', estado: 'PR' },
    { id: '3', nome: 'Lorena', crea: '98.123/D', estado: 'PR' },
    { id: '4', nome: 'Tainara', crea: '98.123/D', estado: 'PR' },
  ]);

  const [showEngForm, setShowEngForm] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [newEng, setNewEng] = useState<Partial<Engenheiro>>({ estado: 'PR' });
  
  const mapInstance = useRef<any>(null);
  const markerInstance = useRef<any>(null);

  const [formData, setFormData] = useState<Laudo>({
    municipio: '',
    data: new Date().toLocaleDateString('pt-BR'),
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

  const initMap = async () => {
    if (!showMapModal) return;
    let center: [number, number] = [-25.4284, -49.2733];
    if (formData.municipio) {
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${formData.municipio},Paraná,Brazil&limit=1`);
        const data = await resp.json();
        if (data && data[0]) center = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      } catch (e) {}
    }

    setTimeout(() => {
      const map = L.map('map-selector', { center, zoom: 16 });
      mapInstance.current = map;
      const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google'
      });
      googleHybrid.addTo(map);
      const marker = L.marker(center, { draggable: true }).addTo(map);
      markerInstance.current = marker;

      const reverseGeocode = async (lat: number, lng: number) => {
        setFormData(prev => ({ ...prev, coordenadas: { lat: lat.toFixed(6), lng: lng.toFixed(6) } }));
        try {
          const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
          const data = await resp.json();
          if (data && data.address) {
            const a = data.address;
            const rua = a.road || a.pedestrian || '';
            const num = a.house_number || 'S/N';
            const bairro = a.suburb || a.neighbourhood || a.village || '';
            const cep = a.postcode || '';
            setFormData(prev => ({ ...prev, endereco: `${rua}, ${num}, ${bairro} - CEP: ${cep}` }));
          }
        } catch (e) {}
      };

      map.on('click', (e: any) => { marker.setLatLng(e.latlng); reverseGeocode(e.latlng.lat, e.latlng.lng); });
      marker.on('dragend', (e: any) => { reverseGeocode(e.target.getLatLng().lat, e.target.getLatLng().lng); });
    }, 200);
  };

  useEffect(() => {
    if (showMapModal) initMap();
    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [showMapModal]);

  const updateCalculatedFields = (classificacao: ClassificacaoDano) => {
    const table: Record<ClassificacaoDano, { nivel: string, perc: string }> = {
      [ClassificacaoDano.MINIMOS]: { nivel: 'Sem Destruição', perc: '10%' },
      [ClassificacaoDano.PARCIAIS]: { nivel: 'Destruição Parcial Leve', perc: '40%' },
      [ClassificacaoDano.SEVEROS]: { nivel: 'Destruição Parcial Grave', perc: '70%' },
      [ClassificacaoDano.RUINA]: { nivel: 'Destruição Total', perc: '100%' },
    };
    const { nivel, perc } = table[classificacao];
    setFormData(prev => ({ ...prev, classificacao, nivelDestruicao: nivel, percentualDestruicao: perc }));
  };

  const generatePDF = async () => {
    const doc = new jsPDF();
    const eng = engenheiros.find(e => e.id === formData.engenheiroId);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const drawCommonLayout = (d: jsPDF) => {
      d.setFontSize(10); d.setFont('helvetica', 'bold');
      d.text('ESTADO DO PARANÁ', 105, 15, { align: 'center' });
      d.text('COORDENADORIA ESTADUAL DA DEFESA CIVIL', 105, 20, { align: 'center' });
      d.text('FUNDO ESTADUAL PARA CALAMIDADES PÚBLICAS', 105, 25, { align: 'center' });
      
      d.setDrawColor(0, 51, 102); d.setLineWidth(2); d.line(0, pageHeight - 20, 160, pageHeight - 20);
      d.setDrawColor(255, 102, 0); d.line(160, pageHeight - 20, pageWidth, pageHeight - 20);
      
      d.setFontSize(7); d.setFont('helvetica', 'normal');
      d.text('Palácio das Araucárias - 1º andar - Setor C | Centro Cívico | Curitiba/PR | CEP 80.530-140', 105, pageHeight - 12, { align: 'center' });
      d.text('E-mail: defesacivil@defesacivil.pr.gov.br | Fone: (41) 3281-2500', 105, pageHeight - 9, { align: 'center' });
      d.setFont('helvetica', 'bold'); d.text('“Defesa Civil somos todos nós”', 105, pageHeight - 4, { align: 'center' });
    };

    drawCommonLayout(doc);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('LAUDO DE IMÓVEL AFETADO POR EVENTO CLIMÁTICO', 105, 40, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text('MUNICÍPIO:', 20, 55); doc.setFont('helvetica', 'normal'); doc.text(formData.municipio.toUpperCase(), 45, 55);
    doc.setFont('helvetica', 'bold'); doc.text('DATA:', 20, 65); doc.setFont('helvetica', 'normal'); doc.text(formData.data, 35, 65);

    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('INFORMAÇÕES DO IMÓVEL', 105, 80, { align: 'center' });
    
    doc.setFontSize(10);
    const addLine = (label: string, value: string, y: number) => {
      doc.setFont('helvetica', 'bold'); doc.text(`${label}:`, 20, y);
      doc.setFont('helvetica', 'normal'); doc.text(value.toUpperCase() || '', 65, y);
    };

    addLine('INSCRIÇÃO MUNICIPAL', formData.inscricaoMunicipal, 95);
    addLine('PROPRIETÁRIO', formData.proprietario, 105);
    addLine('REQUERENTE', formData.requerente, 115);
    addLine('ENDEREÇO', formData.endereco, 125);
    addLine('COORDENADAS', `${formData.coordenadas.lat}, ${formData.coordenadas.lng}`, 135);

    doc.setDrawColor(0); doc.setLineWidth(0.5);
    doc.rect(20, 145, 170, 80);
    doc.setFontSize(8); doc.text('ESPAÇO RESERVADO PARA LOCALIZAÇÃO', 105, 185, { align: 'center' });
    
    addLine('TIPOLOGIA', formData.tipologia === 'Outro' ? (formData.tipologiaOutro || '').toUpperCase() : formData.tipologia.toUpperCase(), 245);

    doc.addPage();
    drawCommonLayout(doc);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('LEVANTAMENTO DE DANOS', 105, 40, { align: 'center' });

    let currentY = 55;
    for (const dano of formData.danos) {
      if (currentY > 220) { doc.addPage(); drawCommonLayout(doc); currentY = 45; }
      doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(`${dano.tipo.toUpperCase()}:`, 20, currentY);
      doc.setFont('helvetica', 'normal');
      const descLines = doc.splitTextToSize(dano.descricao, 170);
      doc.text(descLines, 20, currentY + 5);
      currentY += (descLines.length * 5) + 10;
      if (dano.fotos.length > 0) {
        let x = 20;
        const imgW = 82;
        const imgH = 62;
        for (let i = 0; i < Math.min(dano.fotos.length, 2); i++) {
          try { doc.addImage(dano.fotos[i], 'JPEG', x, currentY, imgW, imgH); x += 85; } catch(e) {}
        }
        currentY += 70;
      }
    }

    if (currentY > 180) { doc.addPage(); drawCommonLayout(doc); currentY = 45; }
    currentY += 10;
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('AVALIAÇÃO FINAL', 105, currentY, { align: 'center' });
    currentY += 15;
    doc.setFontSize(10);
    addLine('CLASSIFICAÇÃO', formData.classificacao.toUpperCase(), currentY);
    addLine('NÍVEL DE DESTRUIÇÃO', formData.nivelDestruicao.toUpperCase(), currentY + 10);
    addLine('PERCENTUAL CALCULADO', formData.percentualDestruicao, currentY + 20);

    let signY = pageHeight - 65;
    doc.setFont('helvetica', 'bold');
    doc.text(eng ? eng.nome.toUpperCase() : 'ENGENHEIRO NÃO SELECIONADO', 105, signY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text('Engenheiro Civil', 105, signY + 5, { align: 'center' });
    doc.text(eng ? `CREA ${eng.estado} ${eng.crea}` : '', 105, signY + 10, { align: 'center' });

    doc.save(`LAUDO_DC_PR_${formData.municipio.replace(/\s/g, '_')}.pdf`);
  };

  const handleAddEngenheiro = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEng.nome && newEng.crea) {
      const engineer: Engenheiro = { id: Date.now().toString(), nome: newEng.nome, crea: newEng.crea, estado: newEng.estado || 'PR' };
      setEngenheiros(prev => [...prev, engineer]);
      setFormData(prev => ({ ...prev, engenheiroId: engineer.id }));
      setShowEngForm(false);
    }
  };

  const handleDanoToggle = (tipo: string) => {
    setFormData(prev => {
      const exists = prev.danos.find(d => d.tipo === tipo);
      if (exists) return { ...prev, danos: prev.danos.filter(d => d.tipo !== tipo) };
      return { ...prev, danos: [...prev.danos, { tipo, descricao: '', fotos: [] }] };
    });
  };

  const handlePhotoUpload = async (tipo: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const base64s = await Promise.all(files.map(f => new Promise<string>(res => {
        const r = new FileReader(); r.readAsDataURL(f); r.onload = () => res(r.result as string);
      })));
      setFormData(prev => ({ ...prev, danos: prev.danos.map(d => d.tipo === tipo ? { ...d, fotos: [...d.fotos, ...base64s] } : d) }));
    }
  };

  // Cores institucionais: Laranja #FF6600, Azul Marinho #003366
  const inputClasses = "w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6600] outline-none bg-white text-black text-sm transition-all";

  return (
    <div className="min-h-screen bg-[#F4F4F4] font-sans pb-12 text-slate-900">
      <header className="bg-[#FF6600] text-white p-6 shadow-xl border-b-4 border-[#003366]">
        <div className="container mx-auto flex items-center gap-6">
           <div className="bg-white p-3 rounded-2xl shadow-lg">
              <svg className="w-12 h-12 text-[#FF6600]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm0 3.45l8.15 14.1H3.85L12 5.45zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>
           </div>
           <div>
             <h1 className="text-3xl font-black uppercase tracking-tight">Defesa Civil Paraná</h1>
             <p className="text-sm font-semibold opacity-90 uppercase tracking-widest">Coordenadoria Estadual</p>
           </div>
        </div>
      </header>

      <main className="container mx-auto px-4 mt-8 max-w-6xl">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
          <div className="px-8 py-4 bg-[#003366] text-white">
            <h2 className="text-sm font-black uppercase tracking-widest text-center">Formulário de Inspeção Técnica de Imóveis</h2>
          </div>
          
          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Município Afetado</label>
              <select value={formData.municipio} onChange={e => setFormData({...formData, municipio: e.target.value})} className={inputClasses}>
                <option value="">Selecione...</option>
                {MUNICIPIOS_PR.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Data do Levantamento</label>
              <input type="text" value={formData.data} onChange={e => setFormData({...formData, data: e.target.value})} className={inputClasses} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Engenheiro Responsável</label>
              <select value={formData.engenheiroId} onChange={e => e.target.value === 'OUTRO' ? setShowEngForm(true) : setFormData({...formData, engenheiroId: e.target.value})} className={inputClasses}>
                <option value="">Selecione o Profissional...</option>
                {engenheiros.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                <option value="OUTRO" className="font-bold text-[#FF6600]">+ Cadastrar Novo</option>
              </select>
            </div>
          </div>

          <div className="px-8 py-6 bg-slate-50 border-y border-slate-200">
            <h3 className="text-xs font-black text-[#003366] uppercase tracking-widest mb-6 border-l-4 border-[#FF6600] pl-3">Dados Cadastrais do Imóvel</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Inscrição Municipal</label>
                <input type="text" value={formData.inscricaoMunicipal} onChange={e => setFormData({...formData, inscricaoMunicipal: e.target.value})} className={inputClasses} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Proprietário Legal</label>
                <input type="text" value={formData.proprietario} onChange={e => setFormData({...formData, proprietario: e.target.value})} className={inputClasses} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Nome do Requerente</label>
                <input type="text" value={formData.requerente} onChange={e => setFormData({...formData, requerente: e.target.value})} className={inputClasses} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Endereço Completo</label>
                <div className="flex gap-2">
                  <input type="text" value={formData.endereco} onChange={e => setFormData({...formData, endereco: e.target.value})} className={inputClasses} />
                  <button onClick={() => setShowMapModal(true)} className="bg-[#003366] hover:bg-[#001a33] text-white font-black text-[10px] uppercase px-4 rounded-lg shadow-md transition-all">MAPA</button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Latitude</label>
                <input type="text" value={formData.coordenadas.lat} onChange={e => setFormData({...formData, coordenadas: {...formData.coordenadas, lat: e.target.value}})} className={inputClasses} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Longitude</label>
                <input type="text" value={formData.coordenadas.lng} onChange={e => setFormData({...formData, coordenadas: {...formData.coordenadas, lng: e.target.value}})} className={inputClasses} />
              </div>
            </div>
          </div>

          <div className="p-8">
             <h3 className="text-xs font-black text-[#003366] uppercase tracking-widest mb-4 border-l-4 border-[#FF6600] pl-3">Tipologia da Edificação</h3>
             <select value={formData.tipologia} onChange={e => setFormData({...formData, tipologia: e.target.value})} className={inputClasses}>
                <option value="">Selecione...</option>
                {TIPOLOGIAS.map(t => <option key={t} value={t}>{t}</option>)}
             </select>
             {formData.tipologia === 'Outro' && <textarea value={formData.tipologiaOutro} onChange={e => setFormData({...formData, tipologiaOutro: e.target.value})} className={inputClasses + " mt-4 h-20 resize-none"} placeholder="Especifique a tipologia..." />}
          </div>

          <div className="p-8 bg-slate-100 border-t border-slate-200">
             <h3 className="text-xs font-black text-[#003366] uppercase tracking-widest mb-6 border-l-4 border-[#FF6600] pl-3">Levantamento de Danos Observados</h3>
             <div className="flex flex-wrap gap-2 mb-8">
                {DANOS_OPCOES.map(d => (
                  <button
                    key={d}
                    onClick={() => handleDanoToggle(d)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-bold border-2 transition-all ${
                      formData.danos.find(di => di.tipo === d)
                      ? 'bg-[#FF6600] text-white border-[#cc5200] shadow-lg scale-105'
                      : 'bg-white text-slate-500 border-slate-300 hover:border-[#FF6600]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
             </div>
             <div className="space-y-6">
                {formData.danos.map(dano => (
                  <div key={dano.tipo} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#FF6600]"></div>
                    <span className="font-black text-[#FF6600] text-[11px] uppercase mb-4 block tracking-wider">{dano.tipo}</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <textarea
                        value={dano.descricao}
                        onChange={e => setFormData(prev => ({
                          ...prev, danos: prev.danos.map(d => d.tipo === dano.tipo ? {...d, descricao: e.target.value} : d)
                        }))}
                        className={inputClasses + " h-32 resize-none"}
                        placeholder="Descreva a situação encontrada..."
                      />
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Documentação Fotográfica</label>
                        <input type="file" multiple accept="image/*" onChange={e => handlePhotoUpload(dano.tipo, e)} className="text-[10px] w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-[#FF6600] hover:file:bg-orange-100" />
                        <div className="flex flex-wrap gap-2">
                          {dano.fotos.map((f, i) => <img key={i} src={f} className="w-20 h-20 object-cover rounded-lg border-2 border-slate-100 shadow-sm" />)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
             </div>
          </div>

          <div className="p-8 bg-white border-t border-slate-200">
            <h3 className="text-xs font-black text-[#003366] uppercase tracking-widest mb-6 border-l-4 border-[#FF6600] pl-3">Avaliação e Classificação de Danos</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase">Classificação Técnica</label>
                <select value={formData.classificacao} onChange={e => updateCalculatedFields(e.target.value as ClassificacaoDano)} className={inputClasses + " font-black text-[#FF6600]"}>
                  {Object.values(ClassificacaoDano).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                <span className="block text-[8px] text-slate-400 font-black uppercase mb-1">Nível de Destruição</span>
                <span className="text-xs font-black text-[#003366] uppercase">{formData.nivelDestruicao}</span>
              </div>
              <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl text-center">
                <span className="block text-[8px] text-[#FF6600] font-black uppercase mb-1">Percentual de Dano</span>
                <span className="text-lg font-black text-[#FF6600]">{formData.percentualDestruicao}</span>
              </div>
            </div>
          </div>

          <div className="p-10 bg-[#001a33] flex justify-center border-t-8 border-[#FF6600]">
            <button onClick={generatePDF} className="bg-[#FF6600] hover:bg-[#e65c00] text-white font-black py-5 px-16 rounded-2xl shadow-3xl transition-all transform hover:-translate-y-1 active:scale-95 text-lg uppercase tracking-widest flex items-center gap-4">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 16l-5-5h3V4h4v7h3l-5 5zm9-9h-6v2h4v7H7V9h4V7H3v11h18V7z"/></svg>
              Finalizar e Gerar Laudo PDF
            </button>
          </div>
        </div>
      </main>

      {/* MAP MODAL */}
      {showMapModal && (
        <div className="fixed inset-0 bg-[#001a33]/95 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-3xl w-full max-w-5xl overflow-hidden border-4 border-[#FF6600]">
            <div className="p-5 bg-[#003366] text-white flex justify-between items-center">
              <span className="text-xs font-black tracking-widest uppercase ml-4">Geolocalização do Imóvel</span>
              <button onClick={() => setShowMapModal(false)} className="text-3xl hover:text-[#FF6600] mr-4 transition-colors">&times;</button>
            </div>
            <div id="map-selector" className="w-full"></div>
            <div className="p-6 bg-slate-50 flex justify-end gap-6 border-t border-slate-200">
              <button onClick={() => setShowMapModal(false)} className="bg-[#FF6600] hover:bg-[#e65c00] text-white px-12 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-2xl transition-all active:scale-95">Confirmar Localização</button>
            </div>
          </div>
        </div>
      )}

      {/* ENGINEER MODAL */}
      {showEngForm && (
        <div className="fixed inset-0 bg-[#001a33]/80 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-3xl w-full max-w-lg overflow-hidden border-t-8 border-[#FF6600]">
            <div className="p-5 bg-[#003366] text-white font-black text-xs uppercase flex justify-between tracking-widest">
              <span>Cadastro de Perito / Engenheiro</span>
              <button onClick={() => setShowEngForm(false)} className="text-2xl">&times;</button>
            </div>
            <form onSubmit={handleAddEngenheiro} className="p-8 space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Nome Completo</label>
                <input required type="text" value={newEng.nome || ''} onChange={e => setNewEng({...newEng, nome: e.target.value})} className={inputClasses} />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">CREA</label>
                  <input required type="text" value={newEng.crea || ''} onChange={e => setNewEng({...newEng, crea: e.target.value})} className={inputClasses} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">UF</label>
                  <select value={newEng.estado} onChange={e => setNewEng({...newEng, estado: e.target.value})} className={inputClasses}>
                    {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Endereço Profissional</label>
                <input type="text" className={inputClasses} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Telefone de Contato</label>
                <input type="tel" className={inputClasses} />
              </div>
              <button type="submit" className="w-full bg-[#003366] hover:bg-[#001a33] text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl transition-all">Salvar Cadastro</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
