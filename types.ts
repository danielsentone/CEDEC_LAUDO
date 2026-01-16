
export enum ClassificacaoDano {
  MINIMOS = "Danos Mínimos",
  PARCIAIS = "Danos Parciais",
  SEVEROS = "Danos Severos",
  RUINA = "Ruína"
}

export interface Engenheiro {
  id: string;
  nome: string;
  crea: string;
  estado: string;
}

export interface DanoItem {
  tipo: string;
  descricao: string;
  fotos: string[]; // Base64 strings
}

export interface Laudo {
  municipio: string;
  data: string;
  engenheiroId: string;
  inscricaoMunicipal: string;
  proprietario: string;
  requerente: string;
  endereco: string;
  coordenadas: {
    lat: string;
    lng: string;
  };
  tipologia: string;
  tipologiaOutro?: string;
  danos: DanoItem[];
  classificacao: ClassificacaoDano;
  nivelDestruicao: string;
  percentualDestruicao: string;
}
