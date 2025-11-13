import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';

// Tous tes sous-composants
import { ChiffresClesComponent } from './ChiffresClesComponent/chiffres-cles-component';
import { EvolutionChargesComponent } from './EvolutionChargesComponent/evolution-charges-component';
import { ChargesPersonnelComponent } from './ChargesPersonnelComponent/charges-personnel-component';
import { InvestissementComponent } from './InvestissementComponent/investissement-component';
import { ImpotSocietesTabComponent } from './ImpotSocietesTabComponent/impot-societes-tab-component';
import { AcompteImpotComponent } from './AcompteImpotComponent/acompte-impot-component';
import { InfoFiscaleComponent } from './InfoFiscaleComponent/info-fiscale-component';
import { ProjetAffectResultatComponent } from './ProjetAffectResultatComponent/projet-affect-resultat-component';
import { TresorerieComponent } from './TresorerieComponent/tresorerie-component';
import { EstimAutofinancementComponent } from './EstimAutofinancementComponent/estim-autofinancement-component';
import { MAJDocUniqueEvalComponent } from './MAJDocUniqueEvalComponent/majdoc-unique-eval-component';
import { FaitsMarquantsComponent } from './FaitsMarquantsComponent/faits-marquants-component';
import { PerspectivesComponent } from './PerspectivesComponent/perspectives-component';
import { PointsImportantsComponent } from './PointsImportantsComponent/points-importants-component';
import { SignataireComponent } from './SignataireComponent/signataire-component';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ChiffresClesComponent,
    EvolutionChargesComponent,
    ChargesPersonnelComponent,
    InvestissementComponent,
    ImpotSocietesTabComponent,
    AcompteImpotComponent,
    InfoFiscaleComponent,
    ProjetAffectResultatComponent,
    TresorerieComponent,
    EstimAutofinancementComponent,
    MAJDocUniqueEvalComponent,
    FaitsMarquantsComponent,
    PerspectivesComponent,
    PointsImportantsComponent,
    SignataireComponent
  ],
  exports: [
    ChiffresClesComponent,
    EvolutionChargesComponent,
    ChargesPersonnelComponent,
    InvestissementComponent,
    ImpotSocietesTabComponent,
    AcompteImpotComponent,
    InfoFiscaleComponent,
    ProjetAffectResultatComponent,
    TresorerieComponent,
    EstimAutofinancementComponent,
    MAJDocUniqueEvalComponent,
    FaitsMarquantsComponent,
    PerspectivesComponent,
    PointsImportantsComponent,
    SignataireComponent
  ]
})
export class SectionsModule {}
